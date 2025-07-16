import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Database connection configuration
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Create postgres client with connection pooling
const client = postgres(connectionString, {
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idle_timeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
  connect_timeout: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '60000'),
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Create Drizzle instance
export const db = drizzle(client, { schema });

// Export the client for manual queries if needed
export { client };

// Export schema for migrations
export * from './schema.js'; 