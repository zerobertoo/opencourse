import { apiErrorSchema, sessionResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_GRACE_MS } from '../src/auth/sessions';
import { signAccessToken } from '../src/auth/tokens';
import { passwordResetTokens, sessions } from '../src/db/schema';
import {
  createTestApp,
  extractLink,
  registerClient,
  resetDatabase,
  STRONG_PASSWORD,
  TestClient,
  type TestApp,
} from './helpers';

describe('authentication', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    ctx.mailer.sent.length = 0;
  });

  describe('register', () => {
    it('makes the first account the admin and the following ones students', async () => {
      const first = await registerClient(ctx.app, 'first@example.com');
      const second = await registerClient(ctx.app, 'second@example.com');

      expect((await first.client.get('/api/v1/me')).json().user.role).toBe('admin');
      expect((await second.client.get('/api/v1/me')).json().user.role).toBe('student');
    });

    it('creates exactly one admin when many people register at the same moment', async () => {
      const responses = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          new TestClient(ctx.app).post('/api/v1/auth/register', {
            name: `Person ${index}`,
            email: `person${index}@example.com`,
            password: STRONG_PASSWORD,
          }),
        ),
      );
      expect(responses.every((response) => response.statusCode === 201)).toBe(true);
      const roles = responses.map((response) => response.json().user.role);
      expect(roles.filter((role) => role === 'admin')).toHaveLength(1);
    });

    it('normalizes the e-mail, stores the preferences and never returns the hash', async () => {
      const client = new TestClient(ctx.app);
      const response = await client.post('/api/v1/auth/register', {
        name: '  Maria ',
        email: ' Maria@Example.COM ',
        password: STRONG_PASSWORD,
        locale: 'en',
        timeZone: 'America/Sao_Paulo',
      });
      expect(response.statusCode).toBe(201);
      const { user } = sessionResponseSchema.parse(response.json());
      expect(user).toMatchObject({
        name: 'Maria',
        email: 'maria@example.com',
        locale: 'en',
        timeZone: 'America/Sao_Paulo',
        active: true,
      });
      expect(response.body).not.toMatch(/hash|argon2/i);
    });

    it('rejects a duplicate e-mail regardless of case, and a weak password', async () => {
      await registerClient(ctx.app, 'maria@example.com');
      const client = new TestClient(ctx.app);

      const duplicate = await client.post('/api/v1/auth/register', {
        name: 'Other',
        email: 'MARIA@example.com',
        password: STRONG_PASSWORD,
      });
      expect(duplicate.statusCode).toBe(409);
      expect(apiErrorSchema.parse(duplicate.json()).error.code).toBe('conflict');

      const weak = await client.post('/api/v1/auth/register', {
        name: 'Other',
        email: 'other@example.com',
        password: 'short',
      });
      expect(weak.statusCode).toBe(400);
      expect(apiErrorSchema.parse(weak.json()).error.code).toBe('validation');
    });

    it('sets httpOnly cookies, with the refresh cookie limited to the auth path', async () => {
      const response = await new TestClient(ctx.app).post('/api/v1/auth/register', {
        name: 'Maria',
        email: 'maria@example.com',
        password: STRONG_PASSWORD,
      });
      const access = response.cookies.find((cookie) => cookie.name === 'oc_access');
      const refresh = response.cookies.find((cookie) => cookie.name === 'oc_refresh');
      expect(access).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
      expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1/auth' });
    });
  });

  describe('login', () => {
    it('signs in with the right password and starts a session', async () => {
      await registerClient(ctx.app, 'maria@example.com');
      const client = new TestClient(ctx.app);
      const response = await client.post('/api/v1/auth/login', {
        email: 'Maria@Example.com',
        password: STRONG_PASSWORD,
      });
      expect(response.statusCode).toBe(200);
      expect((await client.get('/api/v1/me')).statusCode).toBe(200);
    });

    it('answers the same way for a wrong password and an unknown e-mail', async () => {
      await registerClient(ctx.app, 'maria@example.com');
      const client = new TestClient(ctx.app);

      const wrongPassword = await client.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: 'not the password',
      });
      const unknownEmail = await client.post('/api/v1/auth/login', {
        email: 'nobody@example.com',
        password: 'not the password',
      });
      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownEmail.statusCode).toBe(401);
      expect(unknownEmail.json()).toEqual(wrongPassword.json());
    });

    it('refuses a deactivated account only after the password is verified', async () => {
      const admin = await registerClient(ctx.app, 'admin@example.com');
      const { userId } = await registerClient(ctx.app, 'maria@example.com');
      await admin.client.patch(`/api/v1/admin/users/${userId}/active`, { active: false });

      const client = new TestClient(ctx.app);
      const right = await client.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: STRONG_PASSWORD,
      });
      expect(right.statusCode).toBe(403);

      const wrong = await client.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: 'not the password',
      });
      expect(wrong.statusCode).toBe(401);
    });
  });

  describe('session', () => {
    it('requires a session for /me', async () => {
      const response = await new TestClient(ctx.app).get('/api/v1/me');
      expect(response.statusCode).toBe(401);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('unauthorized');
    });

    it('rejects state-changing requests without the CSRF header', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const response = await client.request('PATCH', '/api/v1/me', {
        body: { name: 'Hacked' },
        csrf: false,
      });
      expect(response.statusCode).toBe(403);
      expect((await client.get('/api/v1/me')).json().user.name).toBe('Test User');
    });

    it('rejects a forged or expired access token', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const [session] = await ctx.app.db.select().from(sessions);

      client.setCookie('oc_access', 'v1.not-a-real-token');
      expect((await client.get('/api/v1/me')).statusCode).toBe(401);

      const expired = signAccessToken(
        ctx.config.AUTH_SECRET,
        session!.id,
        60,
        new Date(Date.now() - 10 * 60 * 1000),
      );
      client.setCookie('oc_access', expired);
      expect((await client.get('/api/v1/me')).statusCode).toBe(401);

      const wrongSecret = signAccessToken(
        'another-secret-with-more-than-32-characters',
        session!.id,
        60,
        new Date(),
      );
      client.setCookie('oc_access', wrongSecret);
      expect((await client.get('/api/v1/me')).statusCode).toBe(401);
    });

    it('rejects a time zone the runtime does not know, on register and on profile update', async () => {
      const bad = await new TestClient(ctx.app).post('/api/v1/auth/register', {
        name: 'Maria',
        email: 'maria@example.com',
        password: STRONG_PASSWORD,
        timeZone: 'Not/AZone',
      });
      expect(bad.statusCode).toBe(400);

      const { client } = await registerClient(ctx.app, 'maria@example.com');
      expect((await client.patch('/api/v1/me', { timeZone: 'Not/AZone' })).statusCode).toBe(400);
      const valid = await client.patch('/api/v1/me', { timeZone: 'America/Sao_Paulo' });
      expect(valid.json().user.timeZone).toBe('America/Sao_Paulo');
    });

    it('updates the profile', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const response = await client.patch('/api/v1/me', { name: 'Maria Silva', locale: 'en' });
      expect(response.statusCode).toBe(200);
      expect(response.json().user).toMatchObject({ name: 'Maria Silva', locale: 'en' });
    });
  });

  describe('refresh', () => {
    it('recovers from an expired access token and rotates the refresh token', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const firstRefresh = client.cookie('oc_refresh');
      client.setCookie('oc_access', 'v1.expired');
      expect((await client.get('/api/v1/me')).statusCode).toBe(401);

      const refreshed = await client.post('/api/v1/auth/refresh');
      expect(refreshed.statusCode).toBe(200);
      expect(client.cookie('oc_refresh')).not.toBe(firstRefresh);
      expect((await client.get('/api/v1/me')).statusCode).toBe(200);
    });

    it('tolerates a parallel request that still carries the previous token', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const original = client.cookie('oc_refresh')!;
      await client.post('/api/v1/auth/refresh');

      const parallelTab = new TestClient(ctx.app);
      parallelTab.setCookie('oc_refresh', original);
      expect((await parallelTab.post('/api/v1/auth/refresh')).statusCode).toBe(200);
      // the session stays alive for the tab that holds the rotated token
      expect((await client.post('/api/v1/auth/refresh')).statusCode).toBe(200);
    });

    it('treats a stale rotated token as theft and ends the whole session', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const stolen = client.cookie('oc_refresh')!;
      await client.post('/api/v1/auth/refresh');

      // age the rotation beyond the grace window
      await ctx.app.db
        .update(sessions)
        .set({ rotatedAt: new Date(Date.now() - REFRESH_GRACE_MS - 5_000) });

      const attacker = new TestClient(ctx.app);
      attacker.setCookie('oc_refresh', stolen);
      expect((await attacker.post('/api/v1/auth/refresh')).statusCode).toBe(401);
      // the legitimate holder is cut off too: the token family is compromised
      expect((await client.post('/api/v1/auth/refresh')).statusCode).toBe(401);
      const [session] = await ctx.app.db.select().from(sessions);
      expect(session!.revokedAt).not.toBeNull();
    });

    it('answers 401 and clears cookies without a refresh token', async () => {
      const response = await new TestClient(ctx.app).post('/api/v1/auth/refresh');
      expect(response.statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('ends the session on the server, not only in the browser', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const access = client.cookie('oc_access')!;
      const refresh = client.cookie('oc_refresh')!;

      expect((await client.post('/api/v1/auth/logout')).statusCode).toBe(204);
      expect(client.cookie('oc_access')).toBeUndefined();

      // even a copied access cookie is dead now
      const copy = new TestClient(ctx.app);
      copy.setCookie('oc_access', access);
      expect((await copy.get('/api/v1/me')).statusCode).toBe(401);
      copy.setCookie('oc_refresh', refresh);
      expect((await copy.post('/api/v1/auth/refresh')).statusCode).toBe(401);
    });

    it('works with only a refresh cookie, and is harmless when signed out', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      client.setCookie('oc_access', 'v1.expired');
      expect((await client.post('/api/v1/auth/logout')).statusCode).toBe(204);
      const [session] = await ctx.app.db.select().from(sessions);
      expect(session!.revokedAt).not.toBeNull();

      expect((await new TestClient(ctx.app).post('/api/v1/auth/logout')).statusCode).toBe(204);
    });
  });

  describe('password recovery', () => {
    it('answers 204 for unknown e-mails and sends nothing', async () => {
      const response = await new TestClient(ctx.app).post('/api/v1/auth/forgot', {
        email: 'nobody@example.com',
      });
      expect(response.statusCode).toBe(204);
      // the work happens after the reply, so wait for it before asserting that nothing was sent
      await ctx.app.settleBackgroundTasks();
      expect(ctx.mailer.sent).toHaveLength(0);
    });

    it('replies before doing the account-dependent work, so timing cannot reveal accounts', async () => {
      await registerClient(ctx.app, 'maria@example.com');
      const client = new TestClient(ctx.app);

      // hold back the background work instead of racing it
      const app = ctx.app as { runInBackground: (task: () => Promise<unknown>) => void };
      const original = app.runInBackground;
      const held: (() => Promise<unknown>)[] = [];
      app.runInBackground = (task) => void held.push(task);
      try {
        const response = await client.post('/api/v1/auth/forgot', { email: 'maria@example.com' });
        // the reply is already out while the lookup, the token and the e-mail have not happened
        expect(response.statusCode).toBe(204);
        expect(held).toHaveLength(1);
        expect(ctx.mailer.sent).toHaveLength(0);
        expect(await ctx.app.db.select().from(passwordResetTokens)).toHaveLength(0);
      } finally {
        app.runInBackground = original;
      }

      await held[0]!();
      await ctx.app.settleBackgroundTasks();
      expect(ctx.mailer.lastTo('maria@example.com')).toBeDefined();
    });

    it('invalidates every older reset link once one is used', async () => {
      await registerClient(ctx.app, 'maria@example.com');
      const anonymous = new TestClient(ctx.app);
      const tokens: string[] = [];
      for (let request = 0; request < 2; request += 1) {
        await anonymous.post('/api/v1/auth/forgot', { email: 'maria@example.com' });
        await ctx.app.settleBackgroundTasks();
        const mail = ctx.mailer.sent[ctx.mailer.sent.length - 1]!;
        tokens.push(new URL(extractLink(mail.text)).searchParams.get('token')!);
      }
      expect(new Set(tokens).size).toBe(2);

      const used = await anonymous.post('/api/v1/auth/reset', {
        token: tokens[1],
        password: 'a brand new password',
      });
      expect(used.statusCode).toBe(204);

      // an attacker holding the first e-mail gets nothing
      const stale = await anonymous.post('/api/v1/auth/reset', {
        token: tokens[0],
        password: 'attacker chosen password',
      });
      expect(stale.statusCode).toBe(400);
      const login = await anonymous.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: 'attacker chosen password',
      });
      expect(login.statusCode).toBe(401);
    });

    it('e-mails a one-time link that sets a new password and ends old sessions', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const anonymous = new TestClient(ctx.app);

      expect(
        (await anonymous.post('/api/v1/auth/forgot', { email: 'maria@example.com' })).statusCode,
      ).toBe(204);
      await ctx.app.settleBackgroundTasks();
      const mail = ctx.mailer.lastTo('maria@example.com')!;
      const link = new URL(extractLink(mail.text));
      expect(link.origin + link.pathname).toBe(`${ctx.config.WEB_BASE_URL}/reset-password`);
      const token = link.searchParams.get('token')!;

      const reset = await anonymous.post('/api/v1/auth/reset', {
        token,
        password: 'a brand new password',
      });
      expect(reset.statusCode).toBe(204);

      // the old session is gone and the old password no longer works
      expect((await client.get('/api/v1/me')).statusCode).toBe(401);
      const oldLogin = await anonymous.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: STRONG_PASSWORD,
      });
      expect(oldLogin.statusCode).toBe(401);
      const newLogin = await anonymous.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: 'a brand new password',
      });
      expect(newLogin.statusCode).toBe(200);

      // a reset token works once
      const reuse = await anonymous.post('/api/v1/auth/reset', {
        token,
        password: 'yet another password',
      });
      expect(reuse.statusCode).toBe(400);
    });

    it('rejects an unknown token and a weak new password', async () => {
      const client = new TestClient(ctx.app);
      const unknown = await client.post('/api/v1/auth/reset', {
        token: 'nope',
        password: 'a brand new password',
      });
      expect(unknown.statusCode).toBe(400);
      const weak = await client.post('/api/v1/auth/reset', { token: 'nope', password: 'short' });
      expect(weak.statusCode).toBe(400);
    });
  });

  describe('change password', () => {
    it('requires the current password and signs out the other sessions only', async () => {
      const { client } = await registerClient(ctx.app, 'maria@example.com');
      const otherDevice = new TestClient(ctx.app);
      await otherDevice.post('/api/v1/auth/login', {
        email: 'maria@example.com',
        password: STRONG_PASSWORD,
      });

      const wrong = await client.put('/api/v1/me/password', {
        currentPassword: 'wrong password',
        newPassword: 'a brand new password',
      });
      expect(wrong.statusCode).toBe(400);

      const changed = await client.put('/api/v1/me/password', {
        currentPassword: STRONG_PASSWORD,
        newPassword: 'a brand new password',
      });
      expect(changed.statusCode).toBe(204);

      expect((await client.get('/api/v1/me')).statusCode).toBe(200);
      expect((await otherDevice.get('/api/v1/me')).statusCode).toBe(401);
    });
  });

  it('keeps a session row per sign-in and ties it to the user', async () => {
    const { userId } = await registerClient(ctx.app, 'maria@example.com');
    const rows = await ctx.app.db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    // only hashes are stored, never the token itself
    expect(rows[0]!.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
