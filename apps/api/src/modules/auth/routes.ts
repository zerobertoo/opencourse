import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  sessionResponseSchema,
} from '@opencourse/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../../auth/passwords';
import {
  findActiveSession,
  refreshSession,
  revokeSession,
  revokeUserSessions,
} from '../../auth/sessions';
import { generateToken, hashToken, verifyAccessToken } from '../../auth/tokens';
import { passwordResetTokens, sessions, users } from '../../db/schema';
import { badRequest, forbidden, unauthorized } from '../../errors';
import { passwordResetEmail } from '../../mail/templates';
import { toLocale, toPublicUser } from '../../mappers';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../plugins/auth';
import { createUser } from '../../users/create-user';
import type { Config } from '../../config';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const REGISTER_LIMIT = { max: 10, timeWindow: '1 hour' };
const RESET_LIMIT = { max: 10, timeWindow: '1 hour' };
const REFRESH_LIMIT = { max: 60, timeWindow: '1 minute' };

// Sign-in and recovery are limited three ways, because any single counter is easy to dodge:
// per (client, account) pair stops guessing at one account from one place; per client stops one
// place sweeping many accounts with a common password; per account stops many places hammering
// one account (and mail-bombing its owner).
const LOGIN_PER_PAIR = { max: 10, timeWindow: '1 minute' };
const LOGIN_PER_CLIENT = { max: 30, timeWindow: '1 minute' };
const LOGIN_PER_ACCOUNT = { max: 20, timeWindow: '1 minute' };
const FORGOT_PER_PAIR = { max: 5, timeWindow: '1 hour' };
const FORGOT_PER_CLIENT = { max: 20, timeWindow: '1 hour' };
const FORGOT_PER_ACCOUNT = { max: 5, timeWindow: '1 hour' };

export const authRoutes: FastifyPluginAsyncZod<{ config: Config }> = async (app, { config }) => {
  app.post(
    '/auth/register',
    {
      config: { rateLimit: REGISTER_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Create an account and start a session',
        body: registerRequestSchema,
        response: { 201: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const { password, ...profile } = request.body;
      const user = await createUser(app.db, {
        ...profile,
        passwordHash: await hashPassword(password),
        promoteFirstUserToAdmin: true,
      });
      await app.startSession(request, reply, user);
      return reply.code(201).send({ user: toPublicUser(user) });
    },
  );

  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          ...LOGIN_PER_PAIR,
          keyGenerator: (request) => `${request.ip}:${loginKey(request)}`,
        },
      },
      preHandler: [
        app.rateLimitBy({
          name: 'login-client',
          ...LOGIN_PER_CLIENT,
          key: (request) => request.ip,
        }),
        app.rateLimitBy({ name: 'login-account', ...LOGIN_PER_ACCOUNT, key: loginKey }),
      ],
      schema: {
        tags: ['auth'],
        summary: 'Sign in with e-mail and password',
        body: loginRequestSchema,
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const [user] = await app.db.select().from(users).where(eq(users.email, email));

      // runs a full hash check even for unknown e-mails, so timing does not reveal them
      const passwordMatches = await verifyPassword(user?.passwordHash, password);
      if (!user || !passwordMatches) throw unauthorized('Invalid e-mail or password');
      // only said after the password is right, so deactivation does not reveal registered e-mails
      if (!user.active) throw forbidden('Account is deactivated');

      await app.startSession(request, reply, user);
      return { user: toPublicUser(user) };
    },
  );

  app.post(
    '/auth/refresh',
    {
      config: { rateLimit: REFRESH_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token and issue a new access token',
        response: { 200: sessionResponseSchema },
      },
    },
    async (request, reply) => {
      const presented = request.cookies[REFRESH_COOKIE];
      const result = presented
        ? await refreshSession(app.db, presented, {
            refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
            now: new Date(),
          })
        : ({ status: 'invalid' } as const);

      if (result.status === 'invalid') {
        app.clearSessionCookies(reply);
        throw unauthorized('Session expired');
      }
      // `grace`: another request already rotated the token, so only the access cookie is renewed
      app.setSessionCookies(
        reply,
        result.session,
        result.status === 'rotated' ? result.refreshToken : null,
      );
      return { user: toPublicUser(result.user) };
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'End the current session',
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const now = new Date();
      const access = request.cookies[ACCESS_COOKIE];
      const accessSessionId = access ? verifyAccessToken(config.AUTH_SECRET, access, now) : null;
      const refresh = request.cookies[REFRESH_COOKIE];

      // an expired access token must not stop the user from signing out
      let sessionId = accessSessionId
        ? (await findActiveSession(app.db, accessSessionId, now))?.session.id
        : undefined;
      if (!sessionId && refresh) {
        const [found] = await app.db
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.refreshTokenHash, hashToken(refresh)));
        sessionId = found?.id;
      }
      if (sessionId) await revokeSession(app.db, sessionId, now);

      app.clearSessionCookies(reply);
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/auth/forgot',
    {
      config: {
        rateLimit: {
          ...FORGOT_PER_PAIR,
          keyGenerator: (request) => `${request.ip}:${loginKey(request)}`,
        },
      },
      preHandler: [
        app.rateLimitBy({
          name: 'forgot-client',
          ...FORGOT_PER_CLIENT,
          key: (request) => request.ip,
        }),
        app.rateLimitBy({ name: 'forgot-account', ...FORGOT_PER_ACCOUNT, key: loginKey }),
      ],
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset e-mail',
        description: 'Always answers 204, whether or not the e-mail belongs to an account.',
        body: forgotPasswordRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { email } = request.body;

      // Everything that differs between "has an account" and "has none" runs after the reply, so
      // response time cannot be used to find out which e-mails are registered.
      app.runInBackground(async () => {
        const [user] = await app.db
          .select()
          .from(users)
          .where(and(eq(users.email, email), eq(users.active, true)));
        if (!user) return;

        const token = generateToken();
        await app.db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        });
        const link = `${config.WEB_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
        app.sendMailInBackground({
          to: user.email,
          ...passwordResetEmail(toLocale(user.locale), link),
        });
      });
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/auth/reset',
    {
      config: { rateLimit: RESET_LIMIT },
      schema: {
        tags: ['auth'],
        summary: 'Set a new password with a reset token',
        body: resetPasswordRequestSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const now = new Date();
      const passwordHash = await hashPassword(request.body.password);

      const changed = await app.db.transaction(async (tx) => {
        // the used flag is set in the same statement that finds the token: one use only
        const [consumed] = await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResetTokens.tokenHash, hashToken(request.body.token)),
              isNull(passwordResetTokens.usedAt),
              gt(passwordResetTokens.expiresAt, now),
            ),
          )
          .returning({ userId: passwordResetTokens.userId });
        if (!consumed) return false;

        await tx
          .update(users)
          .set({ passwordHash, updatedAt: now })
          .where(eq(users.id, consumed.userId));
        // older reset e-mails for this account (several can be pending) must stop working too,
        // or anyone who read one of them could still take the account over
        await tx
          .update(passwordResetTokens)
          .set({ usedAt: now })
          .where(
            and(
              eq(passwordResetTokens.userId, consumed.userId),
              isNull(passwordResetTokens.usedAt),
            ),
          );
        // anyone holding an old session must sign in again with the new password
        await revokeUserSessions(tx, consumed.userId, now);
        return true;
      });

      if (!changed) throw badRequest('Invalid or expired reset token');
      return reply.code(204).send(null);
    },
  );
};

/** Body e-mail used to key login-style rate limits; empty when the body failed validation. */
function loginKey(request: { body?: unknown }): string {
  const email = (request.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : '';
}
