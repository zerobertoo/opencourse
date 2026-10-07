import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/test/mock-services';
import { createMockServices } from './index';
import { API_DB_STORAGE_KEY, API_SESSION_STORAGE_KEY, DB_STORAGE_KEY } from './store';

const realUser = (id: string, name: string) => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  avatarUrl: null,
  role: 'student' as const,
  locale: 'en' as const,
  timeZone: 'UTC',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
});

const ANA = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';
const BEN = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a12';

function create(storage = createMemoryStorage(), mode: 'demo' | 'api' = 'api') {
  return createMockServices({ storage, mode, latency: { min: 0, max: 0 } });
}

describe('mock in API mode', () => {
  it('starts empty: no users, courses, grants or invites, but default settings', async () => {
    const services = create();
    const { db } = services.mock.store;
    expect([db.users, db.courses, db.grants, db.invites]).toEqual([[], [], [], []]);
    expect(db.progress).toEqual([]);
    expect(await services.courses.list()).toEqual([]);
    expect((await services.settings.get()).enabledLocales).toEqual(['pt-BR', 'en']);
  });

  it('keeps its state apart from the demo mode in the same browser storage', () => {
    const storage = createMemoryStorage();
    const api = create(storage, 'api');
    api.mock.setSessionUser(realUser(ANA, 'Ana'));

    // the demo state is still the full seed and knows nothing about the real account
    const demo = create(storage, 'demo');
    expect(demo.mock.store.db.courses.length).toBeGreaterThan(0);
    expect(demo.mock.store.db.users.some((user) => user.id === ANA)).toBe(false);

    expect(storage.getItem(API_DB_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(API_SESSION_STORAGE_KEY)).toBe(ANA);
    expect(storage.getItem(DB_STORAGE_KEY)).not.toBeNull();

    // and the other way round: reopening API mode finds its own empty-but-for-Ana state
    expect(create(storage, 'api').mock.store.db.users.map((user) => user.id)).toEqual([ANA]);
  });

  it('forgets the previous real account when another one signs in', () => {
    const services = create();
    services.mock.setSessionUser(realUser(ANA, 'Ana'));
    services.mock.setSessionUser(realUser(BEN, 'Ben'));
    expect(services.mock.store.db.users.map((user) => user.id)).toEqual([BEN]);
    services.mock.setSessionUser(null);
    expect(services.mock.store.db.users).toEqual([]);
  });
});
