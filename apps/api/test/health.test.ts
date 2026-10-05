import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema, livenessResponseSchema } from '@opencourse/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('health endpoints (dependencies up)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadConfig());
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health reports every dependency as up', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body).toEqual({ status: 'ok', checks: { database: 'up', redis: 'up' } });
  });

  it('GET /health/live answers without touching dependencies', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
    expect(livenessResponseSchema.parse(response.json())).toEqual({ status: 'ok' });
  });

  it('returns the shared error shape for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/nope' });
    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('not_found');
  });

  it('echoes a caller request id and generates one otherwise', async () => {
    const echoed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'abc-123' },
    });
    expect(echoed.headers['x-request-id']).toBe('abc-123');

    const generated = await app.inject({ method: 'GET', url: '/health/live' });
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('serves an OpenAPI document generated from the zod schemas', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/openapi.json' });
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/health/live',
        '/api/v1/auth/login',
        '/api/v1/me',
        '/api/v1/admin/users/{id}/role',
        '/api/v1/invites/{token}/accept',
      ]),
    );
  });
});

describe('health endpoints (dependencies down)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // valid URLs that nothing listens on
    app = await buildApp(
      loadConfig({
        ...process.env,
        DATABASE_URL: 'postgres://opencourse:opencourse@127.0.0.1:1/opencourse',
        REDIS_URL: 'redis://127.0.0.1:1',
      }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health answers 503 and names the failing dependencies', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
    expect(healthResponseSchema.parse(response.json())).toEqual({
      status: 'error',
      checks: { database: 'down', redis: 'down' },
    });
  });

  it('GET /health/live stays 200 so the container is not restarted for a dependency outage', async () => {
    const response = await app.inject({ method: 'GET', url: '/health/live' });
    expect(response.statusCode).toBe(200);
  });
});
