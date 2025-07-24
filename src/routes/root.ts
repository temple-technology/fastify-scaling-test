import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db, pool } from '../db/connection.js';
import { world } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { register } from '../db/connection.js';

const root: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // ---- Global timing hooks (total server time) ----
  fastify.addHook('onRequest', (req, _reply, done) => {
    (req as any)._t0 = process.hrtime.bigint();
    done();
  });

  fastify.addHook('onSend', (req, reply, payload, done) => {
    const t0 = (req as any)._t0;
    if (t0) {
      const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
      reply.header('X-Server-Time', totalMs.toFixed(2));
    }
    done(null, payload);
  });

  function randId() {
    return (Math.random() * 10000 | 0) + 1; // 1..10000
  }

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_req, reply) => {
    reply.type(register.contentType).send(await register.metrics());
  });
  
  // 1. Single row fetch (raw) + pool/query timings
  fastify.get('/world/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    if (!Number.isInteger(id) || id < 1 || id > 10000) return reply.code(400).send();

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    let rows;
    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'SELECT id, "randomNumber" FROM world WHERE id = $1',
        [id]
      );
      rows = res.rows;
    } finally {
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      client.release();
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
    }

    if (!rows[0]) return reply.code(404).send();
    return rows[0];
  });

  // 2. Multiple queries (N random rows) - parallel selects (no extra headers here to keep overhead low)
  fastify.get('/queries', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;
    const promises = Array.from({ length: n }, () =>
      pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
        .then(r => r.rows[0])
    );
    return Promise.all(promises);
  });

  // 3. Updates (read N then write N) inside one transaction (could add timing similarly later)
  fastify.get('/updates', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;

    const selected = await Promise.all(
      Array.from({ length: n }, () =>
        pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
          .then(r => r.rows[0])
      )
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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

  // Health check
  fastify.get('/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'healthy', timestamp: new Date().toISOString() };
    } catch (e: any) {
      reply.code(500);
      return { status: 'unhealthy', error: e.message };
    }
  });


  // Load testing endpoint for monitoring (generates multiple DB calls)
  fastify.get('/load-test', async (request, reply) => {
    const concurrency = Number((request.query as any).concurrency) || 10;
    const iterations = Number((request.query as any).iterations) || 100;
    const delayMs = Number((request.query as any).delay) || 0; // Add delay parameter
    
    if (concurrency > 50 || iterations > 1000) {
      return reply.code(400).send({ error: 'Limits: concurrency <= 50, iterations <= 1000' });
    }

    const startTime = process.hrtime.bigint();
    const promises = [];

    // Helper function to sleep
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < concurrency; i++) {
      promises.push(
        (async () => {
          const results = [];
          for (let j = 0; j < iterations; j++) {
            const id = Math.floor(Math.random() * 10000) + 1;
            const result = await pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [id]);
            results.push(result.rows[0]);
            
            // Add delay between queries if specified
            if (delayMs > 0) {
              await sleep(delayMs);
            }
          }
          return results;
        })()
      );
    }

    const allResults = await Promise.all(promises);
    const endTime = process.hrtime.bigint();
    const totalTimeMs = Number(endTime - startTime) / 1e6;

    return {
      message: 'Load test completed',
      concurrency,
      iterations,
      totalQueries: concurrency * iterations,
      totalTimeMs: totalTimeMs.toFixed(2),
      avgTimePerQuery: (totalTimeMs / (concurrency * iterations)).toFixed(3),
      resultsCount: allResults.flat().length,
      delayBetweenQueries: delayMs + 'ms',
      estimatedDuration: `${((iterations * delayMs) / 1000).toFixed(1)}s per worker`,
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/', async () => ({
    message: 'Fastify + pg Load Test API',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    backend: 'ready'
  }));

  // Drizzle comparison route with timings
  fastify.get('/world_drizzle/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isInteger(id) || id < 1 || id > 10000) return reply.code(400).send();

    // measure whole DB call via drizzle (no pool.wait separate unless you wrap)
    const w0 = process.hrtime.bigint();
    const rows = await db.select().from(world).where(eq(world.id, id)).limit(1);
    const qMs = Number(process.hrtime.bigint() - w0) / 1e6;
    reply.header('X-DB-Time', qMs.toFixed(2)).header('X-Pool-Wait', '0.00'); // drizzle hides wait; treat as 0 for now

    if (!rows[0]) return reply.code(404).send();
    return rows[0];
  });
};

export default root;
