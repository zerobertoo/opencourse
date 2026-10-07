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
  WebhookDelivery,
  WebhookEndpoint,
} from '@opencourse/shared';
import { generatedId } from './seed/ids';

/** Subset of `Storage` used by the mock (lets tests inject a fake). */
export type MockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** An invite as kept by the mock backend: the secret token stays on this side of the service. */
export type StoredInvite = Invite & { token: string };

/** A webhook endpoint as kept by the mock backend: the secret stays on this side of the service. */
export type StoredWebhook = WebhookEndpoint & { secret: string };

/** In-memory state of the whole mock platform. */
export interface MockDatabase {
  users: User[];
  courses: CourseDetail[];
  grants: Grant[];
  invites: StoredInvite[];
  progress: Progress[];
  quizAttempts: QuizAttempt[];
  notes: LessonNote[];
  certificates: Certificate[];
  settings: PlatformSettings;
  webhooks: StoredWebhook[];
  webhookDeliveries: WebhookDelivery[];
  /** Counters by prefix, used to generate new stable ids. */
  counters: Record<string, number>;
}

/**
 * Version of the format and the seed. When the seed or the format changes, bump it: state saved
 * in the session with another version is discarded and the seed is recreated.
 */
export const MOCK_DB_VERSION = 6;

export const DB_STORAGE_KEY = 'opencourse.mock.db';
export const SESSION_STORAGE_KEY = 'opencourse.mock.session';
/** API mode keeps its own state, so demo data and mirrored real data never mix in one browser. */
export const API_DB_STORAGE_KEY = 'opencourse.mock.api-db';
export const API_SESSION_STORAGE_KEY = 'opencourse.mock.api-session';

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
    private readonly storageKey: string = DB_STORAGE_KEY,
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

  /** Generates a new UUID, deterministic for each prefix and counter value. */
  nextId(prefix: string): string {
    const next = (this.database.counters[prefix] ?? 0) + 1;
    this.database.counters[prefix] = next;
    return generatedId(prefix, next);
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
      const raw = this.storage?.getItem(this.storageKey);
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
      this.storage?.setItem(this.storageKey, JSON.stringify(payload));
    } catch {
      // quota exceeded or storage blocked: the state stays in memory only
    }
  }
}

/** Drops the secret token before an invite leaves the mock backend. */
export function toPublicInvite(stored: StoredInvite): Invite {
  const { token, ...invite } = stored;
  void token;
  return invite;
}

/** Drops the secret before an endpoint leaves the mock backend. */
export function toPublicWebhook(stored: StoredWebhook): WebhookEndpoint {
  const { secret, ...webhook } = stored;
  void secret;
  return webhook;
}
