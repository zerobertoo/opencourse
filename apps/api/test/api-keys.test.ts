import {
  apiKeyWithTokenResponseSchema,
  grantResponseSchema,
  listApiKeysResponseSchema,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiKeys, auditLog, users } from '../src/db/schema';
import { createCast, insertCourse } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

describe('API keys', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  /** A client with no cookies that only sends the key, like a plugin would. */
  function pluginClient() {
    return new TestClient(ctx.app);
  }

  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const created = await cast.admin.client.post('/api/v1/admin/api-keys', { name: 'Shop plugin' });
    expect(created.statusCode).toBe(201);
    const { apiKey } = apiKeyWithTokenResponseSchema.parse(created.json());
    return { cast, course, apiKey };
  }

  describe('management', () => {
    it('creates a key, shows the token once and stores only its hash', async () => {
      const { cast, apiKey } = await setup();
      expect(apiKey.token).toMatch(/^oc_/);
      expect(apiKey.tokenPrefix).toBe(apiKey.token.slice(0, 10));
      expect(apiKey.createdById).toBe(cast.admin.userId);

      const [row] = await ctx.app.db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
      expect(row!.tokenHash).not.toContain(apiKey.token);

      const list = await cast.admin.client.get('/api/v1/admin/api-keys');
      const { apiKeys: keys } = listApiKeysResponseSchema.parse(list.json());
      expect(keys).toHaveLength(1);
      expect(JSON.stringify(list.json())).not.toContain(apiKey.token);

      const entries = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, apiKey.id));
      expect(entries.map((entry) => entry.action)).toEqual(['api_key.created']);
    });

    it('is for admins with a session only', async () => {
      const { cast, apiKey } = await setup();
      for (const user of [cast.instructorA, cast.student]) {
        expect((await user.client.get('/api/v1/admin/api-keys')).statusCode).toBe(403);
        expect(
          (await user.client.post('/api/v1/admin/api-keys', { name: 'Nope' })).statusCode,
        ).toBe(403);
      }
      expect((await pluginClient().get('/api/v1/admin/api-keys')).statusCode).toBe(401);
      // a key cannot manage keys
      const viaKey = await pluginClient().request('POST', '/api/v1/admin/api-keys', {
        body: { name: 'Child' },
        headers: bearer(apiKey.token),
      });
      expect(viaKey.statusCode).toBe(401);
    });

    it('validates the name', async () => {
      const { cast } = await setup();
      const response = await cast.admin.client.post('/api/v1/admin/api-keys', { name: '  ' });
      expect(response.statusCode).toBe(400);
    });

    it('revokes a key idempotently and audits it once', async () => {
      const { cast, apiKey } = await setup();
      const first = await cast.admin.client.post(`/api/v1/admin/api-keys/${apiKey.id}/revoke`);
      expect(first.statusCode).toBe(200);
      expect(first.json().apiKey.revokedAt).not.toBeNull();
      const second = await cast.admin.client.post(`/api/v1/admin/api-keys/${apiKey.id}/revoke`);
      expect(second.json().apiKey.revokedAt).toBe(first.json().apiKey.revokedAt);

      const entries = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, 'api_key.revoked'));
      expect(entries).toHaveLength(1);

      const unknown = await cast.admin.client.post(
        '/api/v1/admin/api-keys/00000000-0000-4000-8000-000000000000/revoke',
      );
      expect(unknown.statusCode).toBe(404);
    });
  });

  describe('on the grant routes', () => {
    it('creates a grant with source "plugin", acting as the key owner', async () => {
      const { cast, course, apiKey } = await setup();
      const response = await pluginClient().request('POST', '/api/v1/grants', {
        body: { userId: cast.student.userId, courseId: course.id, expiresAt: null },
        headers: bearer(apiKey.token),
      });
      expect(response.statusCode).toBe(201);
      const { grant } = grantResponseSchema.parse(response.json());
      expect(grant).toMatchObject({ source: 'plugin', createdById: cast.admin.userId });

      const list = await pluginClient().request('GET', '/api/v1/grants', {
        headers: bearer(apiKey.token),
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().grants).toHaveLength(1);

      const revoked = await pluginClient().request('POST', `/api/v1/grants/${grant.id}/revoke`, {
        headers: bearer(apiKey.token),
      });
      expect(revoked.json().grant.status).toBe('revoked');

      const [row] = await ctx.app.db.select().from(apiKeys).where(eq(apiKeys.id, apiKey.id));
      expect(row!.lastUsedAt).not.toBeNull();
    });

    it('records the key id in the audit entries of what the key did, and only those', async () => {
      const { cast, course, apiKey } = await setup();
      const asKey = (method: 'POST', url: string, body?: object) =>
        pluginClient().request(method, url, {
          ...(body ? { body } : {}),
          headers: bearer(apiKey.token),
        });

      const created = await asKey('POST', '/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      const grantId = created.json().grant.id as string;
      // granting again extends the open grant, which is audited as an extension
      const regranted = await asKey('POST', '/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      expect(regranted.statusCode).toBe(200);
      const extended = await asKey('POST', `/api/v1/grants/${grantId}/extend`, { expiresAt: null });
      expect(extended.statusCode).toBe(200);
      expect((await asKey('POST', `/api/v1/grants/${grantId}/revoke`)).statusCode).toBe(200);

      // the same actions with the admin's session carry no key id
      const other = await cast.admin.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      await cast.admin.client.post(`/api/v1/grants/${other.json().grant.id}/revoke`);

      const rows = await ctx.app.db
        .select()
        .from(auditLog)
        .orderBy(auditLog.createdAt, auditLog.id);
      const keyRows = rows.filter(
        (row) =>
          row.action.startsWith('grant.') &&
          row.actorId === cast.admin.userId &&
          (row.metadata as { apiKeyId?: string }).apiKeyId === apiKey.id,
      );
      // every entry of the key belongs to the grant it created, and none leaks to the other one
      for (const row of keyRows) expect(row.targetId).toBe(grantId);
      // revoking again changes nothing, so it adds no entry
      await asKey('POST', `/api/v1/grants/${grantId}/revoke`);
      const afterSecondRevoke = await ctx.app.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.targetId, grantId));
      expect(afterSecondRevoke).toHaveLength(keyRows.length);
      expect(keyRows.map((row) => row.action)).toEqual([
        'grant.created',
        'grant.extended',
        'grant.extended',
        'grant.revoked',
      ]);
      const sessionRows = rows.filter(
        (row) => row.targetId === other.json().grant.id && row.action.startsWith('grant.'),
      );
      expect(sessionRows.map((row) => row.action)).toEqual(['grant.created', 'grant.revoked']);
      for (const row of sessionRows) expect(row.metadata).not.toHaveProperty('apiKeyId');
    });

    it('still marks session grants as manual', async () => {
      const { cast, course } = await setup();
      const response = await cast.admin.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      expect(response.json().grant.source).toBe('manual');
    });

    it('rejects unknown, malformed and revoked keys, without falling back to the cookie', async () => {
      const { cast, course, apiKey } = await setup();
      const body = { userId: cast.student.userId, courseId: course.id, expiresAt: null };
      for (const authorization of ['Bearer oc_unknown', 'Basic abc', `Bearer ${apiKey.token} x`]) {
        const response = await pluginClient().request('POST', '/api/v1/grants', {
          body,
          headers: { authorization },
        });
        expect(response.statusCode, authorization).toBe(401);
      }
      // an admin session plus a bad key is still a 401: the key is what was presented
      const mixed = await cast.admin.client.request('POST', '/api/v1/grants', {
        body,
        headers: bearer('oc_unknown'),
      });
      expect(mixed.statusCode).toBe(401);

      // a foreign Authorization header (for example a proxy's) does not lock out the session
      const foreign = await cast.admin.client.request('POST', '/api/v1/grants', {
        body,
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(foreign.statusCode).toBe(201);

      await cast.admin.client.post(`/api/v1/admin/api-keys/${apiKey.id}/revoke`);
      const afterRevoke = await pluginClient().request('POST', '/api/v1/grants', {
        body,
        headers: bearer(apiKey.token),
      });
      expect(afterRevoke.statusCode).toBe(401);
    });

    it('stops working when its owner is deactivated or loses the admin role', async () => {
      const { cast, course, apiKey } = await setup();
      const call = () =>
        pluginClient().request('GET', '/api/v1/grants', { headers: bearer(apiKey.token) });
      expect((await call()).statusCode).toBe(200);

      await ctx.app.db
        .update(users)
        .set({ role: 'instructor' })
        .where(eq(users.id, cast.admin.userId));
      expect((await call()).statusCode).toBe(401);

      await ctx.app.db
        .update(users)
        .set({ role: 'admin', active: false })
        .where(eq(users.id, cast.admin.userId));
      expect((await call()).statusCode).toBe(401);
      expect(course.id).toBeTruthy();
    });

    it('does not open any other route to a key', async () => {
      const { apiKey } = await setup();
      for (const url of ['/api/v1/me', '/api/v1/courses', '/api/v1/admin/users']) {
        const response = await pluginClient().request('GET', url, {
          headers: bearer(apiKey.token),
        });
        expect(response.statusCode, url).toBe(401);
      }
    });
  });
});
