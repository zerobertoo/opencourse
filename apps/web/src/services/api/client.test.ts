import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE, sessionResponseSchema } from '@opencourse/shared';
import { describe, expect, it, vi } from 'vitest';
import { isServiceError } from '../errors';
import { ApiClient } from './client';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createClient(handler: Handler) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new URL(String(input)), init ?? {})),
  );
  const client = new ApiClient({ baseUrl: 'http://api.test/', fetch: fetchMock as typeof fetch });
  return { client, fetchMock };
}

const user = {
  id: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
  name: 'Maria',
  email: 'maria@example.com',
  avatarUrl: null,
  role: 'student',
  locale: 'en',
  timeZone: 'UTC',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
};

describe('ApiClient', () => {
  it('sends credentials, the CSRF header and a JSON body to the versioned URL', async () => {
    const { client, fetchMock } = createClient(() => json(200, { user }));
    await client.request('POST', '/auth/login', {
      body: { email: 'a@b.co', password: 'x' },
      schema: sessionResponseSchema,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe('http://api.test/api/v1/auth/login');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ email: 'a@b.co', password: 'x' }),
    });
    expect(init?.headers).toMatchObject({
      [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      'content-type': 'application/json',
    });
  });

  it('builds the query string and skips undefined values', async () => {
    const { client, fetchMock } = createClient(() => json(200, {}));
    await client.request('GET', '/admin/users', { query: { search: 'ana', role: undefined } });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      'http://api.test/api/v1/admin/users?search=ana',
    );
  });

  it('returns undefined for a 204 response', async () => {
    const { client } = createClient(() => new Response(null, { status: 204 }));
    await expect(client.request('POST', '/auth/logout')).resolves.toBeUndefined();
  });

  it.each([
    [404, 'not_found', 'not_found'],
    [409, 'conflict', 'conflict'],
    [429, 'rate_limited', 'rate_limited'],
    [500, 'internal', 'unavailable'],
  ])('maps a %i API error body to the %s service error', async (status, apiCode, serviceCode) => {
    const { client } = createClient(() => json(status, { error: { code: apiCode, message: 'm' } }));
    const error = await client.request('GET', '/anything').catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe(serviceCode);
  });

  it('falls back to the HTTP status when the error body is not the API shape', async () => {
    const bad = createClient(() => new Response('<html>bad gateway</html>', { status: 502 }));
    const gateway = await bad.client.request('GET', '/x').catch((caught: unknown) => caught);
    expect(isServiceError(gateway) && gateway.code).toBe('unavailable');

    const invalid = createClient(() => new Response('nope', { status: 400 }));
    const rejected = await invalid.client.request('GET', '/x').catch((caught: unknown) => caught);
    expect(isServiceError(rejected) && rejected.code).toBe('validation');
  });

  it('reports an unreachable API as unavailable', async () => {
    const { client } = createClient(() => {
      throw new TypeError('Failed to fetch');
    });
    const error = await client.request('GET', '/x').catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe('unavailable');
  });

  it('treats a response that breaks the contract as unavailable', async () => {
    const { client } = createClient(() => json(200, { user: { id: 1 } }));
    const error = await client
      .request('GET', '/me', { schema: sessionResponseSchema })
      .catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe('unavailable');
  });

  describe('session refresh', () => {
    /** An API whose access token is expired until `/auth/refresh` succeeds. */
    function expiringSession(options: { refreshWorks: boolean } = { refreshWorks: true }) {
      let refreshed = false;
      return createClient((url) => {
        if (url.pathname.endsWith('/auth/refresh')) {
          refreshed = options.refreshWorks;
          return options.refreshWorks
            ? json(200, { user })
            : json(401, { error: { code: 'unauthorized', message: 'Session expired' } });
        }
        return refreshed
          ? json(200, { user })
          : json(401, { error: { code: 'unauthorized', message: 'Authentication required' } });
      });
    }

    const paths = (fetchMock: ReturnType<typeof createClient>['fetchMock']) =>
      fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname.replace('/api/v1', ''));

    it('renews the session once and retries the original request', async () => {
      const { client, fetchMock } = expiringSession();
      const result = await client.request('GET', '/me', { schema: sessionResponseSchema });
      expect(result.user.email).toBe('maria@example.com');
      expect(paths(fetchMock)).toEqual(['/me', '/auth/refresh', '/me']);
    });

    it('shares a single refresh between concurrent failed requests', async () => {
      const { client, fetchMock } = expiringSession();
      await Promise.all([
        client.request('GET', '/me', { schema: sessionResponseSchema }),
        client.request('GET', '/me', { schema: sessionResponseSchema }),
        client.request('GET', '/me', { schema: sessionResponseSchema }),
      ]);
      expect(paths(fetchMock).filter((path) => path === '/auth/refresh')).toHaveLength(1);
    });

    it('gives up as unauthorized when the refresh fails, without retrying forever', async () => {
      const { client, fetchMock } = expiringSession({ refreshWorks: false });
      const error = await client.request('GET', '/me').catch((caught: unknown) => caught);
      expect(isServiceError(error) && error.code).toBe('unauthorized');
      expect(paths(fetchMock)).toEqual(['/me', '/auth/refresh']);
    });

    it('does not try to refresh when an auth endpoint itself answers 401', async () => {
      const { client, fetchMock } = createClient(() =>
        json(401, { error: { code: 'unauthorized', message: 'Invalid e-mail or password' } }),
      );
      const error = await client
        .request('POST', '/auth/login', { body: {} })
        .catch((caught: unknown) => caught);
      expect(isServiceError(error) && error.code).toBe('unauthorized');
      expect(paths(fetchMock)).toEqual(['/auth/login']);
    });

    it('can refresh again later after a refresh finished', async () => {
      const { client, fetchMock } = expiringSession();
      await client.request('GET', '/me', { schema: sessionResponseSchema });
      expect(paths(fetchMock).filter((path) => path === '/auth/refresh')).toHaveLength(1);
      // a refresh that already completed must not block the next one
      await client.request('GET', '/me', { schema: sessionResponseSchema });
      expect(paths(fetchMock)).toEqual(['/me', '/auth/refresh', '/me', '/me']);
    });
  });
});
