import {
  platformSettingsSchema,
  updatePlatformSettingsRequestSchema,
  type PlatformSettings,
} from '@opencourse/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import { loadPlatformSettings, updatePlatformSettings, withoutEmailDetails } from './service';

export const settingsRoutes: FastifyPluginAsyncZod<{ config: Config }> = async (
  app,
  { config },
) => {
  app.get(
    '/settings',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['admin'],
        summary: 'Platform settings',
        description:
          'Branding and languages for everyone signed in. The e-mail server fields come back ' +
          'empty unless the caller is an admin.',
        response: { 200: platformSettingsSchema },
      },
    },
    async (request): Promise<PlatformSettings> => {
      const current = await loadPlatformSettings(app.db, config);
      return request.auth!.user.role === 'admin' ? current : withoutEmailDetails(current);
    },
  );

  app.patch(
    '/admin/settings',
    {
      preHandler: app.requireRole('admin'),
      schema: {
        tags: ['admin'],
        summary: 'Change platform settings',
        description:
          'Merges the given fields into the current settings and validates the result. The SMTP ' +
          'password is never stored here: it stays in the `SMTP_PASSWORD` environment variable.',
        body: updatePlatformSettingsRequestSchema,
        response: { 200: platformSettingsSchema },
      },
    },
    (request): Promise<PlatformSettings> =>
      updatePlatformSettings(app.db, config, request.body, request.auth!.user.id),
  );
};
