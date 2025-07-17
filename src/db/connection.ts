import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import 'dotenv/config';




const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  
  max: parseInt(process.env.DB_POOL_MAX || '75'),
  min: parseInt(process.env.DB_POOL_MIN || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  
  ssl: false,
  
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'), 
});


export const db = drizzle(pool, { schema });


export { pool };


pool.on('connect', (client) => {
  console.log('📊 New database connection established to PgPool cluster');
});

pool.on('error', (err, client) => {
  console.error('❌ Database connection error:', err);
});

pool.on('acquire', (client) => {
  console.log('🔄 Database connection acquired from pool');
});

pool.on('release', (client) => {
  console.log('🔓 Database connection released back to pool');
});


process.on('SIGINT', async () => {
  console.log('Closing database connections...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing database connections...');
  await pool.end();
  process.exit(0);
}); 