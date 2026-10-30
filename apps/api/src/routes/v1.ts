import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from '@opencourse/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../config';
import { forbidden } from '../errors';
import { authRoutes } from '../modules/auth/routes';
import { certificateRoutes } from '../modules/certificates/routes';
import { coverRoutes } from '../modules/courses/cover-routes';
import { curriculumRoutes } from '../modules/courses/curriculum-routes';
import { courseRoutes } from '../modules/courses/routes';
import { enrollmentRoutes } from '../modules/enrollments/routes';
import { grantRoutes } from '../modules/grants/routes';
import { inviteRoutes } from '../modules/invites/routes';
import { meRoutes } from '../modules/me/routes';
import { progressRoutes } from '../modules/progress/routes';
import { settingsRoutes } from '../modules/settings/routes';
import { studioRoutes } from '../modules/studio/routes';
import { userRoutes } from '../modules/users/routes';
import { fileRoutes } from '../modules/files/routes';
import { videoRoutes } from '../modules/video/routes';
import { webhookRoutes } from '../modules/webhooks/routes';
import { apiKeyRoutes } from '../modules/api-keys/routes';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Versioned REST API, mounted under `/api/v1`.
 * Domain modules (auth, courses, grants...) register here.
 */
export const v1Routes: FastifyPluginAsyncZod<{
  config: Config;
  queuePrefix?: string | undefined;
}> = async (app, { config, queuePrefix }) => {
  // CSRF defense for cookie sessions: a state-changing request must carry a custom header,
  // which a cross-site form or image request cannot add (and CORS blocks for scripts)
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const sent = request.headers[CSRF_HEADER_NAME];
    if (sent === CSRF_HEADER_VALUE) return;
    // a client that sends the header with another value needs to hear the value, not "missing"
    throw forbidden(
      sent === undefined
        ? `Missing ${CSRF_HEADER_NAME} header`
        : `Invalid ${CSRF_HEADER_NAME} header: the value must be "${CSRF_HEADER_VALUE}"`,
    );
  });

  await app.register(authRoutes, { config });
  await app.register(meRoutes);
  await app.register(certificateRoutes);
  await app.register(courseRoutes);
  await app.register(coverRoutes);
  await app.register(curriculumRoutes, { config });
  await app.register(grantRoutes);
  await app.register(progressRoutes);
  await app.register(enrollmentRoutes);
  await app.register(settingsRoutes, { config });
  await app.register(studioRoutes);
  await app.register(userRoutes);
  await app.register(inviteRoutes, { config });
  await app.register(videoRoutes, { config, queuePrefix });
  await app.register(fileRoutes, { config });
  await app.register(webhookRoutes, { config, queuePrefix });
  await app.register(apiKeyRoutes);
};
