import {
  changePasswordRequestSchema,
  listSessionsResponseSchema,
  sessionIdParamsSchema,
  sessionResponseSchema,
  updateProfileRequestSchema,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/passwords';
import { listUserSessions, revokeOwnSession, revokeUserSessions } from '../auth/sessions';
import { users } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { toPublicUser } from '../users/mappers';
import { authContext } from '../../plugins/auth';

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
    async (request) => ({ user: toPublicUser(authContext(request).user) }),
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
        .where(eq(users.id, authContext(request).user.id))
        .returning();
      if (!updated) throw notFound('User not found');
      return { user: toPublicUser(updated) };
    },
  );

  app.get(
    '/me/sessions',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Signed-in devices of the authenticated user',
        response: { 200: listSessionsResponseSchema },
      },
    },
    async (request) => {
      const { user, sessionId } = authContext(request);
      const rows = await listUserSessions(app.db, user.id, new Date());
      return {
        sessions: rows.map((row) => ({
          id: row.id,
          userAgent: row.userAgent,
          ip: row.ip,
          createdAt: row.createdAt.toISOString(),
          lastUsedAt: row.lastUsedAt.toISOString(),
          current: row.id === sessionId,
        })),
      };
    },
  );

  app.delete(
    '/me/sessions/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Sign out one of your devices',
        description: 'Ending the current session signs this browser out.',
        params: sessionIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { user, sessionId } = authContext(request);
      const ended = await revokeOwnSession(app.db, user.id, request.params.id, new Date());
      if (!ended) throw notFound('Session not found');
      if (request.params.id === sessionId) app.clearSessionCookies(reply);
      return reply.code(204).send(null);
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
      const { user, sessionId } = authContext(request);
      const matches = await verifyPassword(user.passwordHash, request.body.currentPassword);
      if (!matches) throw badRequest('Current password is incorrect', { field: 'currentPassword' });

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
