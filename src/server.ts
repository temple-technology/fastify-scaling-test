import 'dotenv/config';
import cluster from 'node:cluster';
import { availableParallelism } from 'node:os';
import process from 'node:process';
import Fastify from 'fastify';
import app from './app.js';

const numCPUs = availableParallelism();

if (cluster.isPrimary) {
  console.log(`🚀 Primary ${process.pid} is running`);
  
  // Fork workers (configurable via WORKERS env var, default to CPU count, max 12 to match PGPOOL_NUM_INIT_CHILDREN=1200)
  const maxWorkers = parseInt(process.env.WORKERS || '0') || Math.min(numCPUs, 12);
  const numWorkers = Math.min(maxWorkers, 12);
  console.log(`🔥 Starting ${numWorkers} workers...`);
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  cluster.on('online', (worker) => {
    console.log(`✅ Worker ${worker.process.pid} is online`);
  });

  cluster.on('exit', (worker, code, signal) => {
    console.log(`💀 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('🛑 Primary received SIGTERM, shutting down gracefully...');
    cluster.disconnect(() => {
      process.exit(0);
    });
  });

} else {
  // Worker process
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    },
    keepAliveTimeout: parseInt(process.env.FASTIFY_KEEP_ALIVE_TIMEOUT || '90000'),
    connectionTimeout: parseInt(process.env.FASTIFY_CONNECTION_TIMEOUT || '30000'),
    bodyLimit: parseInt(process.env.FASTIFY_BODY_LIMIT || '1048576'),
    maxParamLength: 500,
    ignoreTrailingSlash: true,
    caseSensitive: false,
    requestIdLogLabel: 'reqId',
    requestIdHeader: 'x-request-id',
    trustProxy: true
  });

  // Register the main app plugin
  fastify.register(app);

  // Start server
  const start = async () => {
    try {
      const port = parseInt(process.env.PORT || '3000');
      const host = process.env.HOST || '0.0.0.0';
      
      await fastify.listen({ port, host });
      console.log(`🌟 Worker ${process.pid} listening on http://${host}:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };

  start();
} 