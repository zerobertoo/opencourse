import { afterEach, describe, expect, it, vi } from 'vitest';
import { isServiceError } from '@/services/errors';
import {
  createMemoryStorage,
  createServicesSignedInAs,
  createTestServices,
} from '@/test/mock-services';
import { DB_STORAGE_KEY, MOCK_DB_VERSION } from './store';

afterEach(() => {
  vi.useRealTimers();
});

describe('mock runtime', () => {
  it('simulates latency before resolving', async () => {
    vi.useFakeTimers();
    const { services } = createTestServices({ latency: { min: 200, max: 200 } });

    let settled = false;
    const pending = services.courses.list().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(199);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it('fails only the operations selected by failOn, with an unavailable error', async () => {
    const { services } = createTestServices({
      failOn: (operation) => operation === 'courses.list',
    });

    await expect(services.courses.list()).rejects.toMatchObject({ code: 'unavailable' });
    await expect(services.courses.list()).rejects.toSatisfy(isServiceError);
    await expect(services.settings.get()).resolves.toBeDefined();
  });

  it('never leaks internal state: results are copies', async () => {
    const { services } = createTestServices();
    const [first] = await services.courses.list();
    first!.translations[0]!.title = 'Alterado fora do service';
    first!.moduleCount = 0;

    const [again] = await services.courses.list();
    expect(again!.translations[0]!.title).not.toBe('Alterado fora do service');
    expect(again!.moduleCount).toBeGreaterThan(0);
  });
});

describe('mock persistence', () => {
  it('keeps changes and the session across instances sharing the same storage', async () => {
    const storage = createMemoryStorage();
    const first = createTestServices({ storage }).services;
    await first.auth.signInAs('instructor');
    await first.courses.create({ title: 'Curso criado na sessão', defaultLocale: 'pt-BR' });

    const second = createTestServices({ storage }).services;
    const titles = (await second.courses.list()).map((c) => c.translations[0]?.title);
    expect(titles).toContain('Curso criado na sessão');
    expect((await second.auth.getCurrentUser())?.role).toBe('instructor');
  });

  it('works in memory only when there is no storage', async () => {
    const { services } = createTestServices({ storage: null });
    await services.auth.signInAs('admin');
    expect((await services.auth.getCurrentUser())?.role).toBe('admin');
  });

  it('discards saved data from another version and rebuilds the seed', async () => {
    const storage = createMemoryStorage();
    const { services } = createTestServices({ storage });
    await services.auth.signInAs('instructor');
    await services.courses.create({ title: 'Extra', defaultLocale: 'pt-BR' });
    const saved = JSON.parse(storage.getItem(DB_STORAGE_KEY)!) as { version: number };
    expect(saved.version).toBe(MOCK_DB_VERSION);

    storage.setItem(DB_STORAGE_KEY, JSON.stringify({ ...saved, version: MOCK_DB_VERSION - 1 }));
    const reloaded = createTestServices({ storage }).services;
    expect(await reloaded.courses.list()).toHaveLength(5);
  });

  it('recovers from corrupted storage', async () => {
    const storage = createMemoryStorage();
    storage.setItem(DB_STORAGE_KEY, '{not valid json');
    const { services } = createTestServices({ storage });
    expect(await services.courses.list()).toHaveLength(5);
  });

  it('restores the original data with reset', async () => {
    const { services } = await createServicesSignedInAs('rafael');
    await services.courses.create({ title: 'Temporário', defaultLocale: 'pt-BR' });
    expect(await services.courses.list()).toHaveLength(6);

    services.mock.store.reset();
    expect(await services.courses.list()).toHaveLength(5);
  });
});
