import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSRF_HEADER_NAME } from '@opencourse/shared';
import packageJson from '../package.json';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface Operation {
  security?: Record<string, string[]>[];
  responses?: Record<string, unknown>;
  parameters?: { name: string; in: string; required?: boolean }[];
}

// public by design: no session needed
const PUBLIC_OPERATIONS = new Set([
  'GET /health',
  'GET /health/live',
  'GET /api/v1/settings',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/forgot',
  'POST /api/v1/auth/reset',
  'GET /api/v1/certificates/verify/{code}',
  'GET /api/v1/invites/{token}',
  'POST /api/v1/invites/{token}/accept',
  // addressed by an unguessable id, a playback token or a presigned URL
  'GET /api/v1/courses/{id}/cover/{coverId}',
  'GET /api/v1/videos/{assetId}/{file}',
]);

describe('OpenAPI contract', () => {
  let app: FastifyInstance;
  let document: {
    info: { version: string };
    components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
    paths: Record<string, Partial<Record<(typeof METHODS)[number], Operation>>>;
  };
  const operations: { id: string; path: string; method: string; operation: Operation }[] = [];

  beforeAll(async () => {
    app = await buildApp(loadConfig());
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/docs/openapi.json' });
    document = response.json();
    for (const [path, item] of Object.entries(document.paths)) {
      for (const method of METHODS) {
        const operation = item[method];
        if (operation) {
          operations.push({ id: `${method.toUpperCase()} ${path}`, path, method, operation });
        }
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('takes its version from the API package', () => {
    expect(document.info.version).toBe(packageJson.version);
    expect(document.info.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares the cookie session and the API key bearer', () => {
    expect(document.components.securitySchemes).toMatchObject({
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'oc_access' },
      apiKeyAuth: { type: 'http', scheme: 'bearer' },
    });
    expect(document.components.schemas).toHaveProperty('ApiError');
  });

  it('lets only the four grant routes take an API key', () => {
    const withKey = operations
      .filter(({ operation }) => operation.security?.some((entry) => 'apiKeyAuth' in entry))
      .map(({ id }) => id)
      .sort();
    expect(withKey).toEqual([
      'GET /api/v1/grants',
      'POST /api/v1/grants',
      'POST /api/v1/grants/{id}/extend',
      'POST /api/v1/grants/{id}/revoke',
    ]);
  });

  it('declares 401 on every protected operation', () => {
    const missing = operations
      .filter(
        ({ operation }) =>
          operation.security?.length &&
          !operation.security.some((entry) => !Object.keys(entry).length),
      )
      .filter(({ operation }) => !operation.responses?.['401'])
      .map(({ id }) => id);
    expect(missing).toEqual([]);
  });

  it('marks every operation as protected unless it is known to be public', () => {
    const unprotected = operations
      .filter(({ operation }) => !operation.security?.length)
      .map(({ id }) => id)
      .filter((id) => !PUBLIC_OPERATIONS.has(id));
    // anything listed here is either a new public route (add it above) or one missing its guard
    expect(unprotected).toEqual([]);
  });

  it('declares 404 on every operation with a path parameter', () => {
    const missing = operations
      .filter(({ path }) => path.includes('{'))
      .filter(({ operation }) => !operation.responses?.['404'])
      .map(({ id }) => id);
    expect(missing).toEqual([]);
  });

  it('documents the CSRF header on every operation that changes data', () => {
    const missing = operations
      .filter(({ method }) => method !== 'get')
      .filter(
        ({ operation }) =>
          !operation.parameters?.some(
            (p) => p.in === 'header' && p.name === CSRF_HEADER_NAME && p.required,
          ),
      )
      .map(({ id }) => id);
    expect(missing).toEqual([]);
  });
});
