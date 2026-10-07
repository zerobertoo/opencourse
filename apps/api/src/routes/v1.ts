import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../config';
import { forbidden } from '../errors';
import { authRoutes } from '../modules/auth/routes';
import { certificateRoutes } from '../modules/certificates/routes';
import { registerCertificateListeners } from '../modules/certificates/listeners';
import { curriculumRoutes } from '../modules/courses/curriculum-routes';
import { courseRoutes } from '../modules/courses/routes';
import { enrollmentRoutes } from '../modules/enrollments/routes';
import { grantRoutes } from '../modules/grants/routes';
import { inviteRoutes } from '../modules/invites/routes';
import { meRoutes } from '../modules/me/routes';
import { progressRoutes } from '../modules/progress/routes';
import { studioRoutes } from '../modules/studio/routes';
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
  await app.register(certificateRoutes);
  registerCertificateListeners(app, config.WEB_BASE_URL);
  await app.register(courseRoutes);
  await app.register(curriculumRoutes);
  await app.register(grantRoutes);
  await app.register(progressRoutes);
  await app.register(enrollmentRoutes);
  await app.register(studioRoutes);
  await app.register(userRoutes);
  await app.register(inviteRoutes, { config });
};
