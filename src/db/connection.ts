// db/connection.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Registry, collectDefaultMetrics, Gauge } from 'prom-client';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  max: parseInt(process.env.DB_POOL_MAX || '100'),
  min: parseInt(process.env.DB_POOL_MIN || '75'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  
  ssl: false,
  
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'), 
});
export const db = drizzle(pool);

export const register = new Registry();
collectDefaultMetrics({ register });

// ✅ Prevent re-registering metrics (hot reload / cluster forks)
if (!(globalThis as any).__pgMetricsInit) {
  new Gauge({
    name: 'pg_pool_size',
    help: 'Current pool size (active + idle).',
    registers: [register],
    collect() { this.set(pool.totalCount); },
  });

  new Gauge({
    name: 'pg_pool_active_connections',
    help: 'Active connections.',
    registers: [register],
    collect() { this.set(pool.totalCount - pool.idleCount); },
  });

  new Gauge({
    name: 'pg_pool_idle_connections',
    help: 'Idle connections.',
    registers: [register],
    collect() { this.set(pool.idleCount); },
  });

  new Gauge({
    name: 'pg_pool_waiting_connections',
    help: 'Waiting clients.',
    registers: [register],
    collect() { this.set(pool.waitingCount); },
  });

  const pgPoolErrors = new Gauge({
    name: 'pg_pool_errors_total',
    help: 'Total pool errors since start.',
    registers: [register],
  });

  let errorCount = 0;
  pool.on('error', (err) => {
    errorCount += 1;
    pgPoolErrors.set(errorCount);
    console.error('❌ Database connection error:', err);
  });

  (globalThis as any).__pgMetricsInit = true;
}

// (optional) monitorPgPool(pool, { register });

async function closePool() {
  console.log('Closing database connections...');
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);
