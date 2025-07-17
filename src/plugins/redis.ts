import fp from 'fastify-plugin';
import { Redis } from '@upstash/redis';
import { FastifyInstance } from 'fastify';


export interface RedisPluginOptions {
  url?: string;
  token?: string;
}


export interface CacheUtils {
  get: <T = any>(key: string) => Promise<T | null>;
  set: (key: string, value: any, ttlSeconds?: number) => Promise<void>;
  del: (key: string) => Promise<void>;
  exists: (key: string) => Promise<boolean>;
  generateKey: (...parts: (string | number)[]) => string;
  withCache: <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ) => Promise<T>;
}


declare module 'fastify' {
  export interface FastifyInstance {
    redis: Redis;
    cache: CacheUtils;
  }
}

export default fp<RedisPluginOptions>(async (fastify: FastifyInstance, opts) => {
  const redisUrl = opts.url || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = opts.token || process.env.UPSTASH_REDIS_REST_TOKEN;

  
  if (!redisUrl || !redisToken) {
    fastify.log.warn('⚠️  Redis credentials not provided - caching disabled');
    
    
    const mockRedis = {
      ping: async () => 'PONG',
      get: async () => null,
      set: async () => 'OK',
      setex: async () => 'OK',
      del: async () => 1,
      exists: async () => 0,
      flushall: async () => 'OK'
    } as unknown as Redis;
    
    const mockCache: CacheUtils = {
      async get<T = any>(key: string): Promise<T | null> { return null; },
      async set(key: string, value: any, ttlSeconds?: number): Promise<void> {},
      async del(key: string): Promise<void> {},
      async exists(key: string): Promise<boolean> { return false; },
      generateKey(...parts: (string | number)[]): string { return parts.join(':'); },
      async withCache<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        return await fetcher(); 
      }
    };

    fastify.decorate('redis', mockRedis);
    fastify.decorate('cache', mockCache);
    return;
  }

  
  const redis = new Redis({
    url: redisUrl,
    token: redisToken,
  });

  
  try {
    await redis.ping();
    fastify.log.info('✅ Connected to Upstash Redis');
  } catch (error) {
    fastify.log.error('❌ Failed to connect to Redis:', error);
    fastify.log.warn('⚠️  Continuing without Redis - caching disabled');
    
    
    const mockCache: CacheUtils = {
      async get<T = any>(key: string): Promise<T | null> { return null; },
      async set(key: string, value: any, ttlSeconds?: number): Promise<void> {},
      async del(key: string): Promise<void> {},
      async exists(key: string): Promise<boolean> { return false; },
      generateKey(...parts: (string | number)[]): string { return parts.join(':'); },
      async withCache<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
        return await fetcher(); 
      }
    };

    fastify.decorate('redis', { ping: async () => 'MOCK' } as unknown as Redis);
    fastify.decorate('cache', mockCache);
    return;
  }

  
  const cache: CacheUtils = {
    
    async get<T = any>(key: string): Promise<T | null> {
      try {
        const result = await redis.get(key);
        return result as T;
      } catch (error) {
        fastify.log.error('Redis GET error:', error);
        return null;
      }
    },

    
    async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
      try {
        if (ttlSeconds) {
          await redis.setex(key, ttlSeconds, JSON.stringify(value));
        } else {
          await redis.set(key, JSON.stringify(value));
        }
      } catch (error) {
        fastify.log.error('Redis SET error:', error);
      }
    },

    
    async del(key: string): Promise<void> {
      try {
        await redis.del(key);
      } catch (error) {
        fastify.log.error('Redis DEL error:', error);
      }
    },

    
    async exists(key: string): Promise<boolean> {
      try {
        const result = await redis.exists(key);
        return result === 1;
      } catch (error) {
        fastify.log.error('Redis EXISTS error:', error);
        return false;
      }
    },

    
    generateKey(...parts: (string | number)[]): string {
      return parts.join(':');
    },

    
    async withCache<T>(
      key: string,
      fetcher: () => Promise<T>,
      ttlSeconds: number = 300 
    ): Promise<T> {
      
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }

      
      const result = await fetcher();
      
      
      await this.set(key, result, ttlSeconds);
      
      return result;
    }
  };

  
  fastify.decorate('redis', redis);
  fastify.decorate('cache', cache);

  
  fastify.addHook('onClose', async () => {
    fastify.log.info('Closing Redis connection...');
    
  });
}); 