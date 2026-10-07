import type { Role, User } from '@opencourse/shared';
import { ServiceError } from '../errors';
import {
  API_DB_STORAGE_KEY,
  API_SESSION_STORAGE_KEY,
  clone,
  DB_STORAGE_KEY,
  MockStore,
  SESSION_STORAGE_KEY,
  type MockStorage,
} from './store';
import { createEmptyDatabase, createSeedDatabase } from './seed';

export interface MockOptions {
  /**
   * `demo` (default) starts from the demo seed. `api` starts empty and keeps its state under
   * its own storage keys: the real API owns the data and the mock only mirrors it.
   */
  mode?: 'demo' | 'api';
  /** Where to persist the state. Default: `sessionStorage`. Use `null` for memory only. */
  storage?: MockStorage | null;
  /** Simulated latency in milliseconds. Default: between 120 and 350. Use `{ min: 0, max: 0 }` in tests. */
  latency?: { min: number; max: number };
  /** Forces failures to exercise error states: receives the operation name (e.g. `courses.list`). */
  failOn?: (operation: string) => boolean;
  /** How long a local video upload stays in `processing`, in milliseconds. Default: 2500. */
  videoProcessingMs?: number;
  /** Injectable clock. */
  now?: () => Date;
  /** Injectable randomness, from 0 to 1. */
  random?: () => number;
}

export interface MockContext {
  store: MockStore;
  now(): Date;
  random(): number;
  videoProcessingMs: number;
  /** Runs an operation applying simulated latency and failures. */
  run<T>(operation: string, action: () => T): Promise<T>;
  getSessionUserId(): string | null;
  setSessionUserId(userId: string | null): void;
  /** Authenticated user, or an `unauthorized` error. */
  requireUser(): User;
  /** Authenticated user with one of the roles, or a `forbidden` error. */
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
  const isApiMode = options.mode === 'api';
  const sessionKey = isApiMode ? API_SESSION_STORAGE_KEY : SESSION_STORAGE_KEY;
  const store = new MockStore(
    storage,
    isApiMode ? createEmptyDatabase : () => createSeedDatabase(now()),
    isApiMode ? API_DB_STORAGE_KEY : DB_STORAGE_KEY,
  );

  // without storage the session lives in memory only
  let memorySessionUserId: string | null = null;

  const getSessionUserId = () => {
    if (!storage) return memorySessionUserId;
    try {
      return storage.getItem(sessionKey);
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
    videoProcessingMs: options.videoProcessingMs ?? 2500,
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
        if (userId === null) storage?.removeItem(sessionKey);
        else storage?.setItem(sessionKey, userId);
      } catch {
        // no session persistence
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
