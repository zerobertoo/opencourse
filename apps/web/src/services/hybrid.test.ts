import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './api/client';
import { createHybridServices } from './hybrid';
import { isServiceError } from './errors';
import { createMockServices } from './mock';

const realUser = {
  id: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
  name: 'Maria Real',
  email: 'maria@example.com',
  avatarUrl: null,
  role: 'instructor',
  locale: 'en',
  timeZone: 'UTC',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
};

type Routes = Record<string, () => Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Hybrid services over a fake API answering by "METHOD /path". */
function setup(routes: Routes) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace('/api/v1', '')}`;
    const route = routes[key];
    return Promise.resolve(
      route ? route() : json(404, { error: { code: 'not_found', message: key } }),
    );
  });
  const mock = createMockServices({ storage: null, latency: { min: 0, max: 0 } });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  const services = createHybridServices(client, mock, () => ({ locale: 'en', timeZone: 'UTC' }));
  return { services, mock, fetchMock };
}

describe('hybrid services', () => {
  it('signs in through the API and mirrors the user into the mock session', async () => {
    const { services, mock } = setup({
      'POST /auth/login': () => json(200, { user: realUser }),
    });

    const user = await services.auth.signIn('maria@example.com', 'secret-password');
    expect(user.name).toBe('Maria Real');

    // mocked screens ask the mock who is signed in, and must now get the real user
    expect(await mock.auth.getCurrentUser()).toMatchObject({ id: realUser.id });
    await expect(services.settings.get()).resolves.toBeDefined();
  });

  it('reads certificates from the API, not from the mock', async () => {
    const { services, fetchMock } = setup({
      'GET /certificates/verify/OC-ABCD-EFGH': () =>
        json(200, {
          code: 'OC-ABCD-EFGH',
          issuedAt: '2026-10-06T10:00:00.000Z',
          holderName: 'Real Holder',
          courseTitles: { en: 'Real course' },
          defaultLocale: 'en',
          template: { signatoryName: '', signatoryRole: '', message: '' },
        }),
    });
    expect((await services.certificates.verify('OC-ABCD-EFGH'))?.holderName).toBe('Real Holder');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('keeps mocked services locked until someone signs in', async () => {
    const { services } = setup({});
    const error = await services.settings.update({}).catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe('unauthorized');
  });

  it('restores the session on reload through /me', async () => {
    const { services, mock } = setup({ 'GET /me': () => json(200, { user: realUser }) });
    expect(await services.auth.getCurrentUser()).toMatchObject({ id: realUser.id });
    expect(await mock.auth.getCurrentUser()).toMatchObject({ id: realUser.id });
  });

  it('returns null and clears the mock session when the API says nobody is signed in', async () => {
    const { services, mock } = setup({
      'GET /me': () => json(401, { error: { code: 'unauthorized', message: 'no session' } }),
      'POST /auth/refresh': () =>
        json(401, { error: { code: 'unauthorized', message: 'no session' } }),
    });
    mock.mock.setSessionUser({ ...realUser, role: 'instructor' } as never);

    expect(await services.auth.getCurrentUser()).toBeNull();
    expect(await mock.auth.getCurrentUser()).toBeNull();
  });

  it('stays signed in everywhere when the API sign out fails', async () => {
    const { services, mock } = setup({
      'POST /auth/login': () => json(200, { user: realUser }),
      'POST /auth/logout': () => json(500, { error: { code: 'internal', message: 'boom' } }),
    });
    await services.auth.signIn('maria@example.com', 'secret-password');

    await expect(services.auth.signOut()).rejects.toThrow();
    // the real cookies are still valid and the UI still shows the user, so the mock must agree:
    // otherwise every mocked screen would answer "unauthorized" to a user who looks signed in
    expect(await mock.auth.getCurrentUser()).toMatchObject({ id: realUser.id });
    await expect(services.settings.get()).resolves.toBeDefined();
  });

  it('signs the mock out once the API confirms the sign out', async () => {
    const { services, mock } = setup({
      'POST /auth/login': () => json(200, { user: realUser }),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    });
    await services.auth.signIn('maria@example.com', 'secret-password');
    await services.auth.signOut();
    expect(await mock.auth.getCurrentUser()).toBeNull();
  });

  describe('accounts mirrored into the mock store', () => {
    const otherUser = {
      ...realUser,
      id: '9d4e1c27-5b8a-4f10-a3c6-7e2f9b0d1a55',
      name: 'Ana Other',
      email: 'ana@example.com',
    };
    const storeUserIds = (mock: ReturnType<typeof setup>['mock']) =>
      mock.mock.store.db.users.map((user) => user.id);

    it('removes the previous account when someone else signs in on the same tab', async () => {
      const { services, mock } = setup({
        'POST /auth/login': () => json(200, { user: realUser }),
        'POST /auth/logout': () => new Response(null, { status: 204 }),
      });
      await services.auth.signIn('maria@example.com', 'secret-password');
      expect(storeUserIds(mock)).toContain(realUser.id);

      await services.auth.signOut();
      expect(storeUserIds(mock)).not.toContain(realUser.id);
    });

    it('does not leave account A in the store after B signs in without a sign out', async () => {
      const { services, mock } = setup({
        'POST /auth/login': () => json(200, { user: realUser }),
        'GET /me': () => json(200, { user: otherUser }),
      });
      await services.auth.signIn('maria@example.com', 'secret-password');
      // e.g. the session cookie now belongs to another account after a reload
      await services.auth.getCurrentUser();

      expect(storeUserIds(mock)).toContain(otherUser.id);
      expect(storeUserIds(mock)).not.toContain(realUser.id);
    });

    it('also drops other users mirrored by admin actions, with the records that point at them', async () => {
      const { services, mock } = setup({
        'POST /auth/login': () => json(200, { user: { ...realUser, role: 'admin' } }),
        'PATCH /admin/users/9d4e1c27-5b8a-4f10-a3c6-7e2f9b0d1a55/role': () =>
          json(200, { user: otherUser }),
        'POST /auth/logout': () => new Response(null, { status: 204 }),
      });
      await services.auth.signIn('maria@example.com', 'secret-password');
      await services.users.updateRole(otherUser.id, 'student');
      mock.mock.store.mutate((db) => {
        db.progress.push({
          userId: otherUser.id,
          lessonId: 'any-lesson',
          completed: true,
          videoPositionSeconds: 0,
          updatedAt: '2026-10-01T10:00:00.000Z',
        });
      });
      expect(storeUserIds(mock)).toContain(otherUser.id);

      await services.auth.signOut();
      expect(storeUserIds(mock)).not.toContain(otherUser.id);
      expect(mock.mock.store.db.progress.some((item) => item.userId === otherUser.id)).toBe(false);
    });

    it('never touches the seed users', async () => {
      const { services, mock } = setup({
        'POST /auth/login': () => json(200, { user: realUser }),
        'POST /auth/logout': () => new Response(null, { status: 204 }),
      });
      const seedIds = storeUserIds(mock);
      await services.auth.signIn('maria@example.com', 'secret-password');
      await services.auth.signOut();
      expect(storeUserIds(mock)).toEqual(seedIds);
    });
  });

  it('has no demo sign-in with a real API', async () => {
    const { services } = setup({});
    const error = await services.auth.signInAs('admin').catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe('unavailable');
  });

  it('sends the language and time zone when signing up', async () => {
    const { services, fetchMock } = setup({
      'POST /auth/register': () => json(201, { user: { ...realUser, role: 'admin' } }),
    });
    await services.auth.signUp({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'password-123',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body).toEqual({
      name: 'Maria',
      email: 'maria@example.com',
      password: 'password-123',
      locale: 'en',
      timeZone: 'UTC',
    });
  });

  it('uses the API for users, invites and grants', async () => {
    const created = {
      invite: {
        id: '8c1f0a11-3f2b-4a54-8d1e-2d5e8c1f0a11',
        email: 'new@example.com',
        courseId: null,
        createdById: realUser.id,
        createdAt: '2026-10-01T10:00:00.000Z',
        expiresAt: '2026-10-15T10:00:00.000Z',
        status: 'pending',
      },
      acceptUrl: 'http://localhost:5173/invite/abc',
    };
    const { services, fetchMock } = setup({
      'POST /auth/login': () => json(200, { user: realUser }),
      'POST /invites': () => json(201, created),
      'GET /admin/users': () => json(200, { users: [realUser] }),
      'GET /grants': () => json(200, { grants: [] }),
    });
    await services.auth.signIn('maria@example.com', 'secret-password');

    expect((await services.grants.createInvite({ email: 'new@example.com' })).acceptUrl).toBe(
      'http://localhost:5173/invite/abc',
    );
    expect(await services.users.list()).toHaveLength(1);

    const callsBefore = fetchMock.mock.calls.length;
    expect(await services.grants.list()).toEqual([]);
    // grants.list now goes to the API
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it('keeps the mirrored user fresh after a profile or role change', async () => {
    const { services, mock } = setup({
      'POST /auth/login': () => json(200, { user: realUser }),
      'PATCH /me': () => json(200, { user: { ...realUser, name: 'Maria Renamed' } }),
    });
    await services.auth.signIn('maria@example.com', 'secret-password');
    await services.users.updateProfile({ name: 'Maria Renamed' });

    expect(await mock.auth.getCurrentUser()).toMatchObject({ name: 'Maria Renamed' });
  });
});
