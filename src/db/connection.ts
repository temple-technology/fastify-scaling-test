// src/db/connection.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import 'dotenv/config';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Since PgPool handles connection pooling, keep these moderate
  max: parseInt(process.env.DB_POOL_MAX || '30'),
  min: parseInt(process.env.DB_POOL_MIN || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '5000'),
  // SSL configuration - try with rejectUnauthorized: false for Railway
  ssl: false
});

// Create Drizzle instance with schema
export const db = drizzle(pool, { schema });

// Export pool for direct access if needed
export { pool };

// Graceful shutdown
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