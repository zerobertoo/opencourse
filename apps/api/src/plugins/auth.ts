import cookie from '@fastify/cookie';
import { PLUGIN_TOKEN_PREFIX, type Role } from '@opencourse/shared';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerAsyncHookHandler,
} from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import fp from 'fastify-plugin';
import { createSession, findActiveSession } from '../auth/sessions';
import { hashToken, signAccessToken, verifyAccessToken } from '../auth/tokens';
import type { Config } from '../config';
import { apiKeys, users, type SessionRow, type UserRow } from '../db/schema';
import { forbidden, unauthorized } from '../errors';

export const ACCESS_COOKIE = 'oc_access';
export const REFRESH_COOKIE = 'oc_refresh';
/** The refresh cookie is only sent to the auth endpoints, which keeps it out of every other request. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * How a preHandler authenticates, so the OpenAPI document can tell which routes need a session
 * and which also take an API key.
 */
export const AUTH_KINDS = new WeakMap<object, 'session' | 'apiKey' | 'optional'>();

export interface AuthContext {
  user: UserRow;
  /** Empty on requests authenticated by an API key, which only reach routes that opt in. */
  sessionId: string;
  /** Set when an API key authenticated the request. */
  apiKeyId?: string;
}

/**
 * The caller of a route behind `authenticate` or `authenticateOrApiKey`. A route that forgot its
 * preHandler answers 401 instead of dereferencing null.
 */
export function authContext(request: FastifyRequest): AuthContext {
  if (!request.auth) throw unauthorized();
  return request.auth;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `authenticate`; null on unauthenticated requests. */
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** preHandler that requires a valid session. */
    authenticate: preHandlerAsyncHookHandler;
    /** preHandler that sets `request.auth` when there is a valid session and lets anyone through. */
    authenticateOptional: preHandlerAsyncHookHandler;
    /**
     * Like `authenticate`, but also accepts `Authorization: Bearer <api key>`. Only routes meant
     * for plugins use it; a bad key is a 401 and never falls back to the session cookie.
     */
    authenticateOrApiKey: preHandlerAsyncHookHandler;
    /** preHandler that requires a valid session and one of the given roles. */
    requireRole(...roles: Role[]): preHandlerAsyncHookHandler;
    /** `requireRole` for routes that also take an API key, which always acts as an admin. */
    requireRoleOrApiKey(...roles: Role[]): preHandlerAsyncHookHandler;
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

  const authenticateOptional: preHandlerAsyncHookHandler = async (request) => {
    const token = request.cookies[ACCESS_COOKIE];
    const sessionId = token ? verifyAccessToken(config.AUTH_SECRET, token, new Date()) : null;
    const active = sessionId ? await findActiveSession(app.db, sessionId, new Date()) : null;
    if (active) request.auth = { user: active.user, sessionId: active.session.id };
  };
  app.decorate('authenticateOptional', authenticateOptional);

  const authenticate: preHandlerAsyncHookHandler = async function (request, reply) {
    await authenticateOptional.call(this, request, reply);
    if (!request.auth) throw unauthorized();
  };
  app.decorate('authenticate', authenticate);

  AUTH_KINDS.set(authenticateOptional, 'optional');
  AUTH_KINDS.set(authenticate, 'session');

  const authenticateOrApiKey = async function (
    this: FastifyInstance,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // only a bearer that looks like one of our keys counts: any other Authorization header
    // (a proxy's Basic auth, a foreign token) must not lock out a valid session cookie
    const header = request.headers.authorization;
    if (!header?.startsWith(`Bearer ${PLUGIN_TOKEN_PREFIX}`)) {
      return authenticate.call(this, request, reply);
    }

    const token = /^Bearer (\S+)$/.exec(header)?.[1];
    const [found] = token
      ? await app.db
          .select({ key: apiKeys, user: users })
          .from(apiKeys)
          .innerJoin(users, eq(users.id, apiKeys.createdById))
          .where(and(eq(apiKeys.tokenHash, hashToken(token)), isNull(apiKeys.revokedAt)))
      : [];
    // the key borrows its creator's powers, so it dies with them
    if (!found || !found.user.active || found.user.role !== 'admin') {
      // the token itself is never logged, only that a key was refused and from where
      request.log.warn(
        { ip: request.ip, apiKeyId: found?.key.id },
        found
          ? 'api key refused: its owner is no longer an active admin'
          : 'api key not recognised',
      );
      throw unauthorized();
    }

    // bookkeeping only: at most once a minute, and never a reason to fail the request
    const now = new Date();
    if (!found.key.lastUsedAt || now.getTime() - found.key.lastUsedAt.getTime() > 60_000) {
      await app.db
        .update(apiKeys)
        .set({ lastUsedAt: now })
        .where(eq(apiKeys.id, found.key.id))
        .catch((error: unknown) => request.log.warn({ err: error }, 'api key usage not recorded'));
    }
    request.auth = { user: found.user, sessionId: '', apiKeyId: found.key.id };
  };
  AUTH_KINDS.set(authenticateOrApiKey, 'apiKey');
  app.decorate('authenticateOrApiKey', authenticateOrApiKey);

  app.decorate('requireRole', (...roles: Role[]): preHandlerAsyncHookHandler => {
    const handler: preHandlerAsyncHookHandler = async function (request, reply) {
      await authenticate.call(this, request, reply);
      if (!request.auth || !roles.includes(request.auth.user.role)) throw forbidden();
    };
    AUTH_KINDS.set(handler, 'session');
    return handler;
  });

  app.decorate('requireRoleOrApiKey', (...roles: Role[]): preHandlerAsyncHookHandler => {
    const handler: preHandlerAsyncHookHandler = async function (request, reply) {
      await authenticateOrApiKey.call(this, request, reply);
      if (!request.auth || !roles.includes(request.auth.user.role)) throw forbidden();
    };
    AUTH_KINDS.set(handler, 'apiKey');
    return handler;
  });
});
