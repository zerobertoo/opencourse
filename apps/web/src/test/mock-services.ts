import { createMockServices, type MockOptions } from '@/services/mock';
import type { MockStorage } from '@/services/mock/store';

/** Relógio fixo dos testes: o seed e as regras de validade são calculados a partir dele. */
export const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

export function createMemoryStorage(): MockStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

/** Gerador pseudoaleatório determinístico (LCG) para códigos e tokens estáveis. */
function createSeededRandom(seed = 42): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Services mockados sem latência, com relógio fixo e storage em memória. */
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

/** Atalho: services já autenticados com o e-mail do usuário de seed informado. */
export async function createServicesSignedInAs(userSlug: string) {
  const context = createTestServices();
  await context.services.auth.signIn(`${userSlug}@opencourse.example`, 'qualquer-senha');
  return context;
}
