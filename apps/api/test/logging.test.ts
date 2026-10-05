import { Writable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { maskSensitiveUrl } from '../src/logging';
import { FakeMailer } from './helpers';

describe('maskSensitiveUrl', () => {
  it('hides the invite token and keeps the rest of the URL', () => {
    expect(maskSensitiveUrl('/api/v1/invites/s3cret-token')).toBe('/api/v1/invites/[redacted]');
    expect(maskSensitiveUrl('/api/v1/invites/s3cret-token/accept')).toBe(
      '/api/v1/invites/[redacted]/accept',
    );
    expect(maskSensitiveUrl('/api/v1/invites/s3cret-token?x=1')).toBe(
      '/api/v1/invites/[redacted]?x=1',
    );
  });

  it('leaves other URLs alone, including the invite listing', () => {
    expect(maskSensitiveUrl('/api/v1/invites')).toBe('/api/v1/invites');
    expect(maskSensitiveUrl('/api/v1/invites?courseId=abc')).toBe('/api/v1/invites?courseId=abc');
    expect(maskSensitiveUrl('/api/v1/me')).toBe('/api/v1/me');
  });
});

describe('request logs', () => {
  let app: FastifyInstance;
  const lines: string[] = [];

  beforeAll(async () => {
    const logStream = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    app = await buildApp(loadConfig({ ...process.env, LOG_LEVEL: 'info' }), {
      mailer: new FakeMailer(),
      logStream,
    });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('never writes an invite token to the log', async () => {
    const secret = 'super-secret-invite-token-1234';
    await app.inject({ method: 'GET', url: `/api/v1/invites/${secret}` });
    await app.inject({
      method: 'POST',
      url: `/api/v1/invites/${secret}/accept`,
      headers: { 'x-requested-with': 'opencourse' },
      payload: { name: 'Someone', password: 'a long enough password' },
    });

    const logged = lines.join('');
    expect(logged).toContain('/api/v1/invites/[redacted]');
    expect(logged).not.toContain(secret);
  });

  it('still logs the request line with method and masked URL', async () => {
    lines.length = 0;
    await app.inject({ method: 'GET', url: '/health/live' });
    const request = lines.map((line) => JSON.parse(line)).find((entry) => entry.req);
    expect(request.req).toMatchObject({ method: 'GET', url: '/health/live' });
  });
});
