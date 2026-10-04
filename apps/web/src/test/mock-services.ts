import { createMockServices, type MockOptions } from '@/services/mock';
import type { MockStorage } from '@/services/mock/store';

/** Fixed clock for tests: the seed and the expiry rules are computed from it. */
export const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

export function createMemoryStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Deterministic pseudo-random generator (LCG) for stable codes and tokens. */
function createSeededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Mock services with no latency, a fixed clock and in-memory storage. */
export function createTestServices(options: MockOptions = {}) {
  const storage = options.storage ?? createMemoryStorage();
  const services = createMockServices({
    storage,
    latency: { min: 0, max: 0 },
    now: () => FIXED_NOW,
    random: createSeededRandom(),
    ...options,
  });
  return { services, storage };
}

/** Shortcut: services already signed in with the e-mail of the given seed user. */
export async function createServicesSignedInAs(userSlug: string) {
  const context = createTestServices();
  await context.services.auth.signIn(`${userSlug}@opencourse.example`, 'qualquer-senha');
  return context;
}
