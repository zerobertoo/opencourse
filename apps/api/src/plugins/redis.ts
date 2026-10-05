import fp from 'fastify-plugin';
import { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

/** Opens the Redis connection, exposes it as `app.redis` and closes it with the app. */
export const redisPlugin = fp<{ redisUrl: string }>(async (app, { redisUrl }) => {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 1,
    // keep retrying in the background so the API recovers if Redis restarts
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  redis.on('error', (error) => app.log.warn({ err: error }, 'redis connection error'));
  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    redis.disconnect();
  });
});
