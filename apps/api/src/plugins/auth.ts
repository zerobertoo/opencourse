import cookie from '@fastify/cookie';
import type { Role } from '@opencourse/shared';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import { createSession, findActiveSession } from '../auth/sessions';
import { signAccessToken, verifyAccessToken } from '../auth/tokens';
import type { Config } from '../config';
import type { SessionRow, UserRow } from '../db/schema';
import { forbidden, unauthorized } from '../errors';

export const ACCESS_COOKIE = 'oc_access';
export const REFRESH_COOKIE = 'oc_refresh';
/** The refresh cookie is only sent to the auth endpoints, which keeps it out of every other request. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

export interface AuthContext {
  user: UserRow;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `authenticate`; null on unauthenticated requests. */
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** preHandler that requires a valid session. */
    authenticate: preHandlerAsyncHookHandler;
    /** preHandler that requires a valid session and one of the given roles. */
    requireRole(...roles: Role[]): preHandlerAsyncHookHandler;
    /** Creates a session for the user and sets both cookies on the reply. */
    startSession(request: FastifyRequest, reply: FastifyReply, user: UserRow): Promise<void>;
    /** Sets a fresh access cookie (and the rotated refresh cookie, when given). */
    setSessionCookies(reply: FastifyReply, session: SessionRow, refreshToken: string | null): void;
    clearSessionCookies(reply: FastifyReply): void;
  }
}

/** Cookie parsing, session authentication and role checks. */
export const authPlugin = fp<{ config: Config }>(async (app, { config }) => {
  await app.register(cookie);
  app.decorateRequest('auth', null);

  const baseCookie = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.COOKIE_SECURE,
  };

  const setSessionCookies: FastifyInstance['setSessionCookies'] = (
    reply,
    session,
    refreshToken,
  ) => {
    const accessToken = signAccessToken(
      config.AUTH_SECRET,
      session.id,
      config.ACCESS_TOKEN_TTL_SECONDS,
      new Date(),
    );
    reply.setCookie(ACCESS_COOKIE, accessToken, {
      ...baseCookie,
      path: '/',
      maxAge: config.ACCESS_TOKEN_TTL_SECONDS,
    });
    if (refreshToken) {
      reply.setCookie(REFRESH_COOKIE, refreshToken, {
        ...baseCookie,
        path: REFRESH_COOKIE_PATH,
        maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      });
    }
  };

  app.decorate('setSessionCookies', setSessionCookies);

  app.decorate('clearSessionCookies', (reply: FastifyReply) => {
    reply.clearCookie(ACCESS_COOKIE, { ...baseCookie, path: '/' });
    reply.clearCookie(REFRESH_COOKIE, { ...baseCookie, path: REFRESH_COOKIE_PATH });
  });

  app.decorate(
    'startSession',
    async (request: FastifyRequest, reply: FastifyReply, user: UserRow) => {
      const { session, refreshToken } = await createSession(app.db, {
        userId: user.id,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
        refreshTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
        now: new Date(),
      });
      setSessionCookies(reply, session, refreshToken);
    },
  );

  const authenticate: preHandlerAsyncHookHandler = async (request) => {
    const token = request.cookies[ACCESS_COOKIE];
    const sessionId = token ? verifyAccessToken(config.AUTH_SECRET, token, new Date()) : null;
    const active = sessionId ? await findActiveSession(app.db, sessionId, new Date()) : null;
    if (!active) throw unauthorized();
    request.auth = { user: active.user, sessionId: active.session.id };
  };
  app.decorate('authenticate', authenticate);

  app.decorate('requireRole', (...roles: Role[]): preHandlerAsyncHookHandler => {
    return async function requireRolePreHandler(request, reply) {
      await authenticate.call(this, request, reply);
      if (!request.auth || !roles.includes(request.auth.user.role)) throw forbidden();
    };
  });
});
