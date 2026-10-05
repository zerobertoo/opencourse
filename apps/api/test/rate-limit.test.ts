import { apiErrorSchema } from '@opencourse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, STRONG_PASSWORD, TestClient, type TestApp } from './helpers';

describe('rate limiting', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({ RATE_LIMIT_DISABLED: 'false' });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    // counters live in Redis and would otherwise leak between runs
    const keys = await ctx.app.redis.keys('opencourse:rl:*');
    if (keys.length > 0) await ctx.app.redis.del(...keys);
  });

  it('blocks repeated login attempts for the same e-mail with 429', async () => {
    const client = new TestClient(ctx.app);
    const attempt = () =>
      client.post('/api/v1/auth/login', { email: 'maria@example.com', password: 'wrong password' });

    for (let index = 0; index < 10; index += 1) {
      expect((await attempt()).statusCode).toBe(401);
    }
    const blocked = await attempt();
    expect(blocked.statusCode).toBe(429);
    expect(apiErrorSchema.parse(blocked.json()).error.code).toBe('rate_limited');
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('counts each e-mail separately, so one target does not lock out the others', async () => {
    const client = new TestClient(ctx.app);
    for (let index = 0; index < 11; index += 1) {
      await client.post('/api/v1/auth/login', {
        email: 'victim@example.com',
        password: 'wrong password',
      });
    }
    const other = await client.post('/api/v1/auth/login', {
      email: 'someone.else@example.com',
      password: 'wrong password',
    });
    expect(other.statusCode).toBe(401);
  });

  it('blocks one client sweeping many accounts, though each account stays under its own limit', async () => {
    const client = new TestClient(ctx.app);
    const codes: number[] = [];
    for (let index = 0; index < 31; index += 1) {
      const response = await client.post('/api/v1/auth/login', {
        email: `victim${index}@example.com`,
        password: 'wrong password',
      });
      codes.push(response.statusCode);
    }
    // a single (client, account) counter would never trip here: every account is tried once
    expect(codes.slice(0, 30).every((code) => code === 401)).toBe(true);
    expect(codes[30]).toBe(429);
  });

  it('blocks many clients attacking one account, though each client stays under its own limit', async () => {
    const client = new TestClient(ctx.app);
    const codes: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      const response = await client.request('POST', '/api/v1/auth/login', {
        body: { email: 'victim@example.com', password: 'wrong password' },
        remoteAddress: `10.0.0.${index + 1}`,
      });
      codes.push(response.statusCode);
    }
    expect(codes.slice(0, 20).every((code) => code === 401)).toBe(true);
    expect(codes[20]).toBe(429);
  });

  it('stops many clients from mail-bombing one account through password recovery', async () => {
    const client = new TestClient(ctx.app);
    const codes: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await client.request('POST', '/api/v1/auth/forgot', {
        body: { email: 'victim@example.com' },
        remoteAddress: `10.0.1.${index + 1}`,
      });
      codes.push(response.statusCode);
    }
    expect(codes).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it('limits password recovery requests', async () => {
    const client = new TestClient(ctx.app);
    const codes: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const response = await client.post('/api/v1/auth/forgot', { email: 'maria@example.com' });
      codes.push(response.statusCode);
    }
    expect(codes).toEqual([204, 204, 204, 204, 204, 429]);
  });

  it('does not limit normal use of other routes', async () => {
    const client = new TestClient(ctx.app);
    const registered = await client.post('/api/v1/auth/register', {
      name: 'Maria',
      email: 'maria@example.com',
      password: STRONG_PASSWORD,
    });
    expect(registered.statusCode).toBe(201);
    for (let index = 0; index < 15; index += 1) {
      expect((await client.get('/api/v1/me')).statusCode).toBe(200);
    }
  });
});
