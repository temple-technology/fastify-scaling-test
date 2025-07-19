import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db, pool } from '../db/connection.js';
import { world } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const root: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  function randId() {
    return (Math.random() * 10000 | 0) + 1; // 1..10000
  }

  // 1. Single row fetch (raw)
  fastify.get('/world/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id < 1 || id > 10000) return reply.code(400).send();
    const { rows } = await pool.query(
      'SELECT id, "randomNumber" FROM world WHERE id = $1',
      [id]
    );
    if (!rows[0]) return reply.code(404).send();
    return rows[0];
  });

  // 2. Multiple queries (N random rows) - parallel selects
  fastify.get('/queries', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;
    const promises = Array.from({ length: n }, () =>
      pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
        .then(r => r.rows[0])
    );
    const results = await Promise.all(promises);
    return results;
  });

  // 3. Updates (read N then write N) inside one transaction
  fastify.get('/updates', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;

    // Fetch rows in parallel first
    const selected = await Promise.all(
      Array.from({ length: n }, () =>
        pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
          .then(r => r.rows[0])
      )
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Optionally randomize update ordering to reduce hot spot ordering bias
      for (const r of selected) {
        const newVal = randId();
        await client.query('UPDATE world SET "randomNumber" = $1 WHERE id = $2', [newVal, r.id]);
        r.randomNumber = newVal;
      }
      await client.query('COMMIT');
      return selected;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // 4. Fortunes (optional)
  fastify.get('/fortunes', async () => {
    const { rows } = await pool.query('SELECT id, message FROM fortune');
    rows.push({ id: 0, message: 'Additional fortune added at request time.' });
    rows.sort((a, b) => a.message.localeCompare(b.message));
    return rows;
  });

  // Health check (simple, cheap)
  fastify.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (e: any) {
      reply.code(500);
      return { status: 'unhealthy', error: e.message };
    }
  });

  fastify.get('/', async () => ({
    message: 'Fastify + pg Load Test API',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    backend: 'ready'
  }));

  fastify.get('/world_drizzle/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const rows = await db.select().from(world).where(eq(world.id, id)).limit(1);
    if (!rows[0]) return reply.code(404).send();
    return rows[0];
  });
};

export default root;
