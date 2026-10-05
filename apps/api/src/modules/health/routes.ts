import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  healthResponseSchema,
  livenessResponseSchema,
  type DependencyStatus,
} from '@opencourse/shared';

const CHECK_TIMEOUT_MS = 1500;

/** Resolves `up` if the probe succeeds in time, `down` if it fails or times out. */
async function probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('health check timed out')), CHECK_TIMEOUT_MS);
  });
  try {
    await Promise.race([check(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  // liveness: cheap, used by the Docker healthcheck; never touches dependencies
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
        response: { 200: livenessResponseSchema },
      },
    },
    async () => ({ status: 'ok' as const }),
  );

  // readiness: reports each dependency and answers 503 when any is down
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe with dependency status',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (_request, reply) => {
      const [database, redis] = await Promise.all([
        probe(() => app.db.execute(sql`select 1`)),
        probe(() => app.redis.ping()),
      ]);
      const healthy = database === 'up' && redis === 'up';
      return reply.code(healthy ? 200 : 503).send({
        status: healthy ? 'ok' : 'error',
        checks: { database, redis },
      });
    },
  );
};
