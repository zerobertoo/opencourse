import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../config';
import { forbidden } from '../errors';
import { authRoutes } from '../modules/auth/routes';
import { inviteRoutes } from '../modules/invites/routes';
import { meRoutes } from '../modules/me/routes';
import { userRoutes } from '../modules/users/routes';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Versioned REST API, mounted under `/api/v1`.
 * Domain modules (auth, courses, grants...) register here as their milestones land.
 */
export const v1Routes: FastifyPluginAsyncZod<{ config: Config }> = async (app, { config }) => {
  // CSRF defense for cookie sessions: a state-changing request must carry a custom header,
  // which a cross-site form or image request cannot add (and CORS blocks for scripts)
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (request.headers[CSRF_HEADER_NAME] !== CSRF_HEADER_VALUE) {
      throw forbidden(`Missing ${CSRF_HEADER_NAME} header`);
    }
  });

  await app.register(authRoutes, { config });
  await app.register(meRoutes);
  await app.register(userRoutes);
  await app.register(inviteRoutes, { config });
};
