import 'dotenv/config';
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import cors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function (fastify: FastifyInstance, opts: FastifyPluginOptions) {
  const corsOrigin = process.env.CORS_ORIGIN || true;
  fastify.register(cors, {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  const pluginOptions: Partial<AutoloadPluginOptions> = {};

  fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: pluginOptions
  });

  fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: pluginOptions
  });
}