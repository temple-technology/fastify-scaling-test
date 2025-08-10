import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { db, pool, register } from '../db/connection.js';
import { world } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const crud: FastifyPluginAsync = async (fastify: FastifyInstance) => {

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


  // ========== MONITORING & UTILITY ROUTES ==========

  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_req, reply) => {
    reply.type(register.contentType).send(await register.metrics());
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

  // API info endpoint
  fastify.get('/', async () => ({
    message: 'Fastify + pg Load Test API',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    backend: 'ready'
  }));

  // Load testing endpoint for monitoring (generates multiple DB calls)
  fastify.get('/load-test', async (request, reply) => {
    const concurrency = Number((request.query as any).concurrency) || 10;
    const iterations = Number((request.query as any).iterations) || 100;
    const delayMs = Number((request.query as any).delay) || 0;
    
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

  // ========== WORLD TABLE CRUD OPERATIONS ==========

  // READ - Single row fetch (raw SQL) with pool/query timings
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

  // READ - Drizzle ORM comparison route with timings
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
  
  // CREATE - Insert new world record
  fastify.post('/world', async (request, reply) => {
    const { randomNumber } = request.body as { randomNumber: number };
    
    if (!randomNumber || !Number.isInteger(randomNumber)) {
      return reply.code(400).send({ error: 'randomNumber must be an integer' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'INSERT INTO world ("randomNumber") VALUES ($1) RETURNING id, "randomNumber"',
        [randomNumber]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return reply.code(201).send(res.rows[0]);
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // READ - Get single world record is already defined in root.ts

  // READ ALL - Get all world records with pagination
  fastify.get('/world', async (request, reply) => {
    const { limit = 100, offset = 0 } = request.query as { limit?: number; offset?: number };
    
    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'SELECT id, "randomNumber" FROM world LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return res.rows;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // UPDATE - Update world record (PUT - full replacement)
  fastify.put('/world/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const { randomNumber } = request.body as { randomNumber: number };
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    
    if (!randomNumber || !Number.isInteger(randomNumber)) {
      return reply.code(400).send({ error: 'randomNumber must be an integer' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'UPDATE world SET "randomNumber" = $1 WHERE id = $2 RETURNING id, "randomNumber"',
        [randomNumber, id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'World record not found' });
      }
      
      return res.rows[0];
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // UPDATE - Partial update (PATCH)
  fastify.patch('/world/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const updates = request.body as Partial<{ randomNumber: number }>;
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    
    if (updates.randomNumber !== undefined && !Number.isInteger(updates.randomNumber)) {
      return reply.code(400).send({ error: 'randomNumber must be an integer' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'UPDATE world SET "randomNumber" = $1 WHERE id = $2 RETURNING id, "randomNumber"',
        [updates.randomNumber, id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'World record not found' });
      }
      
      return res.rows[0];
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // DELETE - Delete world record
  fastify.delete('/world/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'DELETE FROM world WHERE id = $1 RETURNING id',
        [id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'World record not found' });
      }
      
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // ========== FORTUNE TABLE CRUD OPERATIONS ==========
  
  // CREATE - Insert new fortune
  fastify.post('/fortune', async (request, reply) => {
    const { message } = request.body as { message: string };
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ error: 'message must be a non-empty string' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'INSERT INTO fortune (message) VALUES ($1) RETURNING id, message',
        [message]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return reply.code(201).send(res.rows[0]);
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // READ - Get single fortune
  fastify.get('/fortune/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'SELECT id, message FROM fortune WHERE id = $1',
        [id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (!res.rows[0]) {
        return reply.code(404).send({ error: 'Fortune not found' });
      }
      
      return res.rows[0];
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // READ ALL - Get all fortunes (already exists in root.ts as /fortunes, adding /fortune for consistency)
  fastify.get('/fortune', async (request, reply) => {
    const { limit = 100, offset = 0 } = request.query as { limit?: number; offset?: number };
    
    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'SELECT id, message FROM fortune LIMIT $1 OFFSET $2',
        [limit, offset]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return res.rows;
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // UPDATE - Update fortune (PUT - full replacement)
  fastify.put('/fortune/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const { message } = request.body as { message: string };
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return reply.code(400).send({ error: 'message must be a non-empty string' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'UPDATE fortune SET message = $1 WHERE id = $2 RETURNING id, message',
        [message, id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Fortune not found' });
      }
      
      return res.rows[0];
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // UPDATE - Partial update (PATCH)
  fastify.patch('/fortune/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    const updates = request.body as Partial<{ message: string }>;
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }
    
    if (updates.message !== undefined && (typeof updates.message !== 'string' || updates.message.trim().length === 0)) {
      return reply.code(400).send({ error: 'message must be a non-empty string' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'UPDATE fortune SET message = $1 WHERE id = $2 RETURNING id, message',
        [updates.message, id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Fortune not found' });
      }
      
      return res.rows[0];
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // DELETE - Delete fortune
  fastify.delete('/fortune/:id', async (request, reply) => {
    const id = Number((request.params as any).id);
    
    if (!Number.isInteger(id) || id < 1) {
      return reply.code(400).send({ error: 'Invalid ID' });
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      const res = await client.query(
        'DELETE FROM fortune WHERE id = $1 RETURNING id',
        [id]
      );
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      
      if (res.rows.length === 0) {
        return reply.code(404).send({ error: 'Fortune not found' });
      }
      
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // ========== BULK OPERATIONS ==========
  
  // Bulk insert for world table
  fastify.post('/world/bulk', async (request, reply) => {
    const records = request.body as Array<{ randomNumber: number }>;
    
    if (!Array.isArray(records) || records.length === 0) {
      return reply.code(400).send({ error: 'Body must be a non-empty array' });
    }
    
    for (const record of records) {
      if (!record.randomNumber || !Number.isInteger(record.randomNumber)) {
        return reply.code(400).send({ error: 'All records must have an integer randomNumber' });
      }
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const record of records) {
        const res = await client.query(
          'INSERT INTO world ("randomNumber") VALUES ($1) RETURNING id, "randomNumber"',
          [record.randomNumber]
        );
        results.push(res.rows[0]);
      }
      await client.query('COMMIT');
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return reply.code(201).send(results);
    } catch (error: any) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Bulk insert for fortune table
  fastify.post('/fortune/bulk', async (request, reply) => {
    const records = request.body as Array<{ message: string }>;
    
    if (!Array.isArray(records) || records.length === 0) {
      return reply.code(400).send({ error: 'Body must be a non-empty array' });
    }
    
    for (const record of records) {
      if (!record.message || typeof record.message !== 'string' || record.message.trim().length === 0) {
        return reply.code(400).send({ error: 'All records must have a non-empty string message' });
      }
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const record of records) {
        const res = await client.query(
          'INSERT INTO fortune (message) VALUES ($1) RETURNING id, message',
          [record.message]
        );
        results.push(res.rows[0]);
      }
      await client.query('COMMIT');
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return reply.code(201).send(results);
    } catch (error: any) {
      await client.query('ROLLBACK');
      return reply.code(500).send({ error: error.message });
    } finally {
      client.release();
    }
  });

  // Bulk delete for world table
  fastify.post('/world/bulk-delete', async (request, reply) => {
    const { ids } = request.body as { ids: number[] };
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'ids must be a non-empty array' });
    }
    
    for (const id of ids) {
      if (!Number.isInteger(id) || id < 1) {
        return reply.code(400).send({ error: 'All ids must be positive integers' });
      }
    }

    const w0 = process.hrtime.bigint();
    const client = await pool.connect();
    const waitMs = Number(process.hrtime.bigint() - w0) / 1e6;

    const q0 = process.hrtime.bigint();
    try {
      await client.query('BEGIN');
      let deletedCount = 0;
      
      for (const id of ids) {
        const result = await client.query('DELETE FROM world WHERE id = $1', [id]);
        deletedCount += result.rowCount || 0;
      }
      
      await client.query('COMMIT');
      const queryMs = Number(process.hrtime.bigint() - q0) / 1e6;
      reply.header('X-Pool-Wait', waitMs.toFixed(2))
           .header('X-DB-Time', queryMs.toFixed(2));
      return { deletedCount, requestedIds: ids.length };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
};

export default crud;