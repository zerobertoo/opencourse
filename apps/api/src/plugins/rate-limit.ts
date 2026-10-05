import rateLimit from '@fastify/rate-limit';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import { HttpError } from '../errors';

export interface ExtraLimit {
  /** Distinguishes this counter from the others (it is part of the Redis key). */
  name: string;
  max: number;
  timeWindow: string | number;
  /** What the limit is counted against: an IP, an e-mail, or both. */
  key: (request: FastifyRequest) => string;
}

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * An additional limit for a route, on top of its `config.rateLimit`. A route can only carry one
     * built-in limit, so layered defenses (per client, per account, per pair) use this.
     */
    rateLimitBy(limit: ExtraLimit): preHandlerAsyncHookHandler;
  }
}

const tooManyRequests = (ttlMs: number) =>
  new HttpError(429, `Too many requests. Try again in ${Math.ceil(ttlMs / 1000)}s.`);

/**
 * Per-route limits, shared across API instances through Redis. Routes opt in with
 * `config: { rateLimit: { max, timeWindow } }`; there is no global limit.
 */
export const rateLimitPlugin = fp<{ disabled: boolean }>(async (app, { disabled }) => {
  await app.register(rateLimit, {
    global: false,
    // run after body validation, so keys can include the (already normalized) e-mail
    hook: 'preHandler',
    redis: app.redis,
    nameSpace: 'opencourse:rl:',
    // an unreachable Redis must not lock everyone out of signing in
    skipOnError: true,
    allowList: () => disabled,
    errorResponseBuilder: (_request, context) => tooManyRequests(context.ttl),
  });

  app.decorate('rateLimitBy', ({ name, max, timeWindow, key }: ExtraLimit) => {
    const check = app.createRateLimit({
      max,
      timeWindow,
      keyGenerator: (request: FastifyRequest) => `${name}:${key(request)}`,
    });
    return async (request) => {
      const result = await check(request);
      // `isAllowed` is true only for allow-listed requests; within the limit it is still false,
      // so the real signal for going over is `isExceeded`
      if (!result.isAllowed && result.isExceeded) throw tooManyRequests(result.ttl);
    };
  });
});
