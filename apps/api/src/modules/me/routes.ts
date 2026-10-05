import {
  changePasswordRequestSchema,
  sessionResponseSchema,
  updateProfileRequestSchema,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../auth/passwords';
import { revokeUserSessions } from '../../auth/sessions';
import { users } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { toPublicUser } from '../../mappers';

const CHANGE_PASSWORD_LIMIT = { max: 10, timeWindow: '15 minutes' };

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'The authenticated user',
        response: { 200: sessionResponseSchema },
      },
    },
    async (request) => ({ user: toPublicUser(request.auth!.user) }),
  );

  app.patch(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Update the authenticated user profile',
        body: updateProfileRequestSchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request) => {
      const { name, locale, timeZone } = request.body;
      const [updated] = await app.db
        .update(users)
        // undefined fields are skipped by Drizzle, so omitted properties stay untouched
        .set({ name, locale, timeZone, updatedAt: new Date() })
        .where(eq(users.id, request.auth!.user.id))
        .returning();
      if (!updated) throw notFound('User not found');
      return { user: toPublicUser(updated) };
    },
  );

  app.put(
    '/me/password',
    {
      preHandler: app.authenticate,
      config: { rateLimit: CHANGE_PASSWORD_LIMIT },
      schema: {
        tags: ['me'],
        summary: 'Change the password of the authenticated user',
        description: 'Signs out every other session of the account.',
        body: changePasswordRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { user, sessionId } = request.auth!;
      const matches = await verifyPassword(user.passwordHash, request.body.currentPassword);
      if (!matches) throw badRequest('Current password is incorrect');

      const passwordHash = await hashPassword(request.body.newPassword);
      const now = new Date();
      await app.db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, user.id));
        await revokeUserSessions(tx, user.id, now, sessionId);
      });
      return reply.code(204).send(null);
    },
  );
};
