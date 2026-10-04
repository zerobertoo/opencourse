import type {
  Certificate,
  CourseDetail,
  Grant,
  Invite,
  PlatformSettings,
  Progress,
  QuizAttempt,
  User,
} from '@opencourse/shared';

/** Subconjunto de `Storage` usado pelo mock (permite injetar um fake nos testes). */
export type MockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Estado em memória de toda a plataforma mockada. */
export interface MockDatabase {
  users: User[];
  courses: CourseDetail[];
  grants: Grant[];
  invites: Invite[];
  progress: Progress[];
  quizAttempts: QuizAttempt[];
  certificates: Certificate[];
  settings: PlatformSettings;
  /** Contadores por prefixo, para gerar ids novos e estáveis. */
  counters: Record<string, number>;
}

/**
 * Versão do formato e do seed. Ao mudar o seed ou o formato, incremente: o estado salvo
 * na sessão com outra versão é descartado e o seed é recriado.
 */
export const MOCK_DB_VERSION = 1;

export const DB_STORAGE_KEY = 'opencourse.mock.db';
export const SESSION_STORAGE_KEY = 'opencourse.mock.session';

interface PersistedDatabase {
  version: number;
  data: MockDatabase;
}

/** Copia profunda: nada que sai dos services pode apontar para o estado interno. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Banco em memória persistido no storage da sessão. */
export class MockStore {
  private database: MockDatabase;

  constructor(
    private readonly storage: MockStorage | null,
    private readonly createSeed: () => MockDatabase,
  ) {
    this.database = this.load() ?? this.reseed();
  }

  /** Estado interno. Uso exclusivo das implementações mock: clone antes de devolver. */
  get db(): MockDatabase {
    return this.database;
  }

  /** Aplica uma alteração e persiste o resultado. */
  mutate<T>(change: (database: MockDatabase) => T): T {
    const result = change(this.database);
    this.persist();
    return result;
  }

  /** Gera um id novo no formato `prefixo_n`. */
  nextId(prefix: string): string {
    const next = (this.database.counters[prefix] ?? 0) + 1;
    this.database.counters[prefix] = next;
    return `${prefix}_${next}`;
  }

  /** Restaura os dados originais. */
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
      // storage indisponível ou conteúdo corrompido: recria o seed
      return null;
    }
  }

  private persist(): void {
    try {
      const payload: PersistedDatabase = { version: MOCK_DB_VERSION, data: this.database };
      this.storage?.setItem(DB_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // cota excedida ou storage bloqueado: o estado segue só em memória
    }
  }
}
