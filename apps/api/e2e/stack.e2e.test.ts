import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema, livenessResponseSchema } from '@opencourse/shared';
import { compose, waitFor } from './support';

// these tests talk to the real stack started by `docker compose up -d --build --wait`
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const S3_URL = process.env.E2E_S3_URL ?? 'http://localhost:9000';

describe('stack: api', () => {
  it('reports every dependency as up on /health', async () => {
    const response = await fetch(`${API_URL}/health`);
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('answers the liveness probe', async () => {
    const response = await fetch(`${API_URL}/health/live`);
    expect(response.status).toBe(200);
    expect(livenessResponseSchema.parse(await response.json())).toEqual({ status: 'ok' });
  });

  it('serves the OpenAPI document and the reference page', async () => {
    const document = (await (await fetch(`${API_URL}/docs/openapi.json`)).json()) as {
      paths: Record<string, unknown>;
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining(['/health', '/health/live']),
    );
    const page = await fetch(`${API_URL}/docs`);
    expect(page.status).toBe(200);
  });

  it('returns the shared error shape and echoes the request id', async () => {
    const response = await fetch(`${API_URL}/api/v1/does-not-exist`, {
      headers: { 'x-request-id': 'e2e-request-1' },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('x-request-id')).toBe('e2e-request-1');
    expect(apiErrorSchema.parse(await response.json()).error.code).toBe('not_found');
  });

  it('sends security headers and restricts CORS to the configured origin', async () => {
    const allowed = await fetch(`${API_URL}/health/live`, {
      headers: { origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('x-content-type-options')).toBe('nosniff');
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');

    const denied = await fetch(`${API_URL}/health/live`, {
      headers: { origin: 'http://evil.test' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('stack: supporting services', () => {
  it('has Mailpit ready to catch e-mails', async () => {
    const response = await fetch(`${MAILPIT_URL}/api/v1/info`);
    expect(response.status).toBe(200);
  });

  it('has the S3 endpoint up (anonymous access is refused, not failing)', async () => {
    const response = await fetch(S3_URL);
    expect(response.status).toBeLessThan(500);
  });
});

describe('stack: resilience', () => {
  it('reports Redis as down while keeping the process alive, then recovers', async () => {
    try {
      compose('stop', 'redis');

      await waitFor('/health to report redis down', async () => {
        const response = await fetch(`${API_URL}/health`);
        const body = healthResponseSchema.parse(await response.json());
        return response.status === 503 && body.checks.redis === 'down';
      });
      // liveness must stay green, or the orchestrator would restart a healthy process
      expect((await fetch(`${API_URL}/health/live`)).status).toBe(200);
    } finally {
      compose('start', 'redis');
    }

    await waitFor(
      '/health to recover',
      async () => (await fetch(`${API_URL}/health`)).status === 200,
    );
  }, 60_000);
});
