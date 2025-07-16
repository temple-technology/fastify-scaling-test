import Fastify from 'fastify';
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { AddressInfo } from 'net';
import cors from '@fastify/cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Enable CORS for the React app
const corsOrigin = process.env.CORS_ORIGIN || true;
fastify.register(cors, {
  origin: corsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

const pluginOptions: Partial<AutoloadPluginOptions> = {
  // Place your custom options the autoload plugin below here.
}

fastify.register(AutoLoad, {
  dir: join(__dirname, 'plugins'),
  options: pluginOptions
});

fastify.register(AutoLoad, {
  dir: join(__dirname, 'routes'),
  options: pluginOptions
});

fastify.listen({ host: '::', port: Number(process.env.PORT) || 3000 }, function (err: Error | null, address: string | AddressInfo) {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  fastify.log.info(`Server listening on ${address}`)
});