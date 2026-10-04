import type {
  Certificate,
  CourseDetail,
  Grant,
  Invite,
  LessonNote,
  PlatformSettings,
  Progress,
  QuizAttempt,
  User,
} from '@opencourse/shared';

/** Subset of `Storage` used by the mock (lets tests inject a fake). */
export type MockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** In-memory state of the whole mock platform. */
export interface MockDatabase {
  users: User[];
  courses: CourseDetail[];
  grants: Grant[];
  invites: Invite[];
  progress: Progress[];
  quizAttempts: QuizAttempt[];
  notes: LessonNote[];
  certificates: Certificate[];
  settings: PlatformSettings;
  /** Counters by prefix, used to generate new stable ids. */
  counters: Record<string, number>;
}

/**
 * Version of the format and the seed. When the seed or the format changes, bump it: state saved
 * in the session with another version is discarded and the seed is recreated.
 */
export const MOCK_DB_VERSION = 2;

export const DB_STORAGE_KEY = 'opencourse.mock.db';
export const SESSION_STORAGE_KEY = 'opencourse.mock.session';

interface PersistedDatabase {
  version: number;
  data: MockDatabase;
}

/** Deep copy: nothing leaving the services may point to the internal state. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** In-memory database persisted in the session storage. */
export class MockStore {
  private database: MockDatabase;

  constructor(
    private readonly storage: MockStorage | null,
    private readonly createSeed: () => MockDatabase,
  ) {
    this.database = this.load() ?? this.reseed();
  }

  /** Internal state. For mock implementations only: clone before returning. */
  get db(): MockDatabase {
    return this.database;
  }

  /** Applies a change and persists the result. */
  mutate<T>(change: (database: MockDatabase) => T): T {
    const result = change(this.database);
    this.persist();
    return result;
  }

  /** Generates a new id in the `prefix_n` format. */
  nextId(prefix: string): string {
    const next = (this.database.counters[prefix] ?? 0) + 1;
    this.database.counters[prefix] = next;
    return `${prefix}_${next}`;
  }

  /** Restores the original data. */
  reset(): void {
    this.reseed();
  }

  private reseed(): MockDatabase {
    this.database = this.createSeed();
    this.persist();
    return this.database;
  }

  private load(): MockDatabase | null {
    try {
      const raw = this.storage?.getItem(DB_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedDatabase;
      return parsed.version === MOCK_DB_VERSION ? parsed.data : null;
    } catch {
      // storage unavailable or corrupted content: recreate the seed
      return null;
    }
  }

  private persist(): void {
    try {
      const payload: PersistedDatabase = { version: MOCK_DB_VERSION, data: this.database };
      this.storage?.setItem(DB_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // quota exceeded or storage blocked: the state stays in memory only
    }
  }
}
