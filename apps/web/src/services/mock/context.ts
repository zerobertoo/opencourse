import type { Role, User } from '@opencourse/shared';
import { ServiceError } from '../errors';
import { clone, MockStore, SESSION_STORAGE_KEY, type MockStorage } from './store';
import { createSeedDatabase } from './seed';

export interface MockOptions {
  /** Onde persistir o estado. Padrão: `sessionStorage`. Use `null` para só memória. */
  storage?: MockStorage | null;
  /** Latência simulada em milissegundos. Padrão: entre 120 e 350. Use `{ min: 0, max: 0 }` nos testes. */
  latency?: { min: number; max: number };
  /** Força falhas para exercitar estados de erro: recebe o nome da operação (ex.: `courses.list`). */
  failOn?: (operation: string) => boolean;
  /** Relógio injetável. */
  now?: () => Date;
  /** Aleatoriedade injetável, de 0 a 1. */
  random?: () => number;
}

export interface MockContext {
  store: MockStore;
  now(): Date;
  random(): number;
  /** Executa uma operação aplicando latência e falhas simuladas. */
  run<T>(operation: string, action: () => T): Promise<T>;
  getSessionUserId(): string | null;
  setSessionUserId(userId: string | null): void;
  /** Usuário autenticado ou erro `unauthorized`. */
  requireUser(): User;
  /** Usuário autenticado com um dos papéis ou erro `forbidden`. */
  requireRole(...roles: Role[]): User;
}

function defaultStorage(): MockStorage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function createMockContext(options: MockOptions = {}): MockContext {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  const latency = options.latency ?? { min: 120, max: 350 };
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const store = new MockStore(storage, () => createSeedDatabase(now()));

  // sem storage a sessão vive só em memória
  let memorySessionUserId: string | null = null;

  const getSessionUserId = () => {
    if (!storage) return memorySessionUserId;
    try {
      return storage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return memorySessionUserId;
    }
  };

  const requireUser = (): User => {
    const userId = getSessionUserId();
    const user = userId ? store.db.users.find((candidate) => candidate.id === userId) : undefined;
    if (!user || !user.active) throw new ServiceError('unauthorized', 'Authentication required');
    return clone(user);
  };

  return {
    store,
    now,
    random,
    async run<T>(operation: string, action: () => T): Promise<T> {
      const delay = latency.min + random() * Math.max(0, latency.max - latency.min);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (options.failOn?.(operation)) {
        throw new ServiceError('unavailable', `Simulated failure in ${operation}`);
      }
      return action();
    },
    getSessionUserId,
    setSessionUserId(userId) {
      memorySessionUserId = userId;
      try {
        if (userId === null) storage?.removeItem(SESSION_STORAGE_KEY);
        else storage?.setItem(SESSION_STORAGE_KEY, userId);
      } catch {
        // sem persistência de sessão
      }
    },
    requireUser,
    requireRole(...roles) {
      const user = requireUser();
      if (!roles.includes(user.role)) {
        throw new ServiceError('forbidden', `Requires role: ${roles.join(', ')}`);
      }
      return user;
    },
  };
}
