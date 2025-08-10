import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { pool } from '../db/connection.js';

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

  // Helper function for random IDs
  function randId() {
    return (Math.random() * 10000 | 0) + 1; // 1..10000
  }

  // ========== TECHEMPOWER BENCHMARK ROUTES ==========
  // These routes are specifically designed for TechEmpower Framework Benchmarks
  // They test specific scenarios: parallel queries and transactional updates
  
  // Multiple queries (N random rows) - parallel selects
  fastify.get('/queries', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;
    
    const q0 = process.hrtime.bigint();
    const promises = Array.from({ length: n }, () =>
      pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
        .then(r => r.rows[0])
    );
    const results = await Promise.all(promises);
    const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
    
    reply.header('X-DB-Time', queryMs.toFixed(2))
         .header('X-Query-Count', n.toString());
    return results;
  });

  // Updates (read N then write N) inside one transaction
  fastify.get('/updates', async (request, reply) => {
    let n = Number((request.query as any).count) || 1;
    if (n < 1) n = 1;
    if (n > 500) n = 500;

    const totalStart = process.hrtime.bigint();
    
    // Phase 1: Read
    const readStart = process.hrtime.bigint();
    const selected = await Promise.all(
      Array.from({ length: n }, () =>
        pool.query('SELECT id, "randomNumber" FROM world WHERE id = $1', [randId()])
          .then(r => r.rows[0])
      )
    );
    const readMs = Number(process.hrtime.bigint() - readStart) / 1e6;

    // Phase 2: Update in transaction
    const updateStart = process.hrtime.bigint();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const r of selected) {
        const newVal = randId();
        await client.query('UPDATE world SET "randomNumber" = $1 WHERE id = $2', [newVal, r.id]);
        r.randomNumber = newVal;
      }
      await client.query('COMMIT');
      const updateMs = Number(process.hrtime.bigint() - updateStart) / 1e6;
      const totalMs = Number(process.hrtime.bigint() - totalStart) / 1e6;
      
      reply.header('X-Read-Time', readMs.toFixed(2))
           .header('X-Update-Time', updateMs.toFixed(2))
           .header('X-Total-Time', totalMs.toFixed(2))
           .header('X-Update-Count', n.toString());
      
      return selected;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // Fortunes with sorting
  fastify.get('/fortunes', async () => {
    const { rows } = await pool.query('SELECT id, message FROM fortune');
    rows.push({ id: 0, message: 'Additional fortune added at request time.' });
    rows.sort((a, b) => a.message.localeCompare(b.message));
    return rows;
  });
};

export default root;