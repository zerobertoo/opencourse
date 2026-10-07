import type { User } from '@opencourse/shared';
import type { Services } from '../types';
import { createMockAuthService } from './auth';
import { createMockCertificateService } from './certificates';
import { createMockContext, type MockContext, type MockOptions } from './context';
import { createMockCourseService } from './courses';
import { createMockCurriculumService } from './curriculum';
import { createMockEnrollmentService } from './enrollments';
import { createMockGrantService } from './grants';
import { createMockNoteService } from './notes';
import { createMockProgressService } from './progress';
import { createMockSettingsService } from './settings';
import { createMockStudioService } from './studio';
import { createEmptyDatabase, createSeedDatabase } from './seed';
import { clone, type MockDatabase } from './store';
import { createMockUserService } from './users';
import { createMockVideoService } from './video';
import { createMockWebhookService } from './webhooks';

export type { MockOptions } from './context';
export { DEMO_USER_IDS } from './seed';

export interface MockServices extends Services {
  /** Development and testing controls; not part of the `Services` contract. */
  mock: Pick<MockContext, 'store'> & {
    /**
     * Makes `user` the signed-in user of the mock (or signs out with null). Used when the real
     * API owns authentication: the mock services still need to know who is asking.
     */
    setSessionUser(user: User | null): void;
    /** Adds or refreshes a user in the mock store without touching the session. */
    upsertUser(user: User): void;
    /** Id of the signed-in user, or null. */
    sessionUserId(): string | null;
  };
}

function upsertInto(db: MockDatabase, user: User): void {
  const index = db.users.findIndex((candidate) => candidate.id === user.id);
  if (index >= 0) db.users[index] = clone(user);
  else db.users.push(clone(user));
}

/**
 * Removes every user that is not part of the seed, except `keepId`, together with the records
 * that point at them. Those users were mirrored from the real API, and the mock store persists
 * in sessionStorage: without this, the next person to sign in on the same tab would find the
 * previous account's name and e-mail in the mocked screens.
 */
function purgeMirroredUsers(db: MockDatabase, seedUserIds: Set<string>, keepId?: string): void {
  const gone = new Set(
    db.users.filter((user) => !seedUserIds.has(user.id) && user.id !== keepId).map((u) => u.id),
  );
  if (gone.size === 0) return;
  db.users = db.users.filter((user) => !gone.has(user.id));
  db.grants = db.grants.filter((record) => !gone.has(record.userId));
  db.progress = db.progress.filter((record) => !gone.has(record.userId));
  db.quizAttempts = db.quizAttempts.filter((record) => !gone.has(record.userId));
  db.notes = db.notes.filter((record) => !gone.has(record.userId));
  db.certificates = db.certificates.filter((record) => !gone.has(record.userId));
}

/** Creates all mock services on top of a single in-memory database. */
export function createMockServices(options: MockOptions = {}): MockServices {
  const context = createMockContext(options);
  // what counts as "seed" is fixed by the seed itself, so it survives page reloads
  const seedUserIds = new Set(
    (options.mode === 'api' ? createEmptyDatabase() : createSeedDatabase(context.now())).users.map(
      (user) => user.id,
    ),
  );
  return {
    auth: createMockAuthService(context),
    courses: createMockCourseService(context),
    curriculum: createMockCurriculumService(context),
    enrollments: createMockEnrollmentService(context),
    progress: createMockProgressService(context),
    notes: createMockNoteService(context),
    certificates: createMockCertificateService(context),
    users: createMockUserService(context),
    grants: createMockGrantService(context),
    settings: createMockSettingsService(context),
    studio: createMockStudioService(context),
    video: createMockVideoService(context),
    webhooks: createMockWebhookService(context),
    mock: {
      store: context.store,
      upsertUser: (user) => context.store.mutate((db) => upsertInto(db, user)),
      sessionUserId: () => context.getSessionUserId(),
      setSessionUser(user) {
        context.store.mutate((db) => {
          // a different account (or nobody) means the previous mirrored accounts must go
          purgeMirroredUsers(db, seedUserIds, user?.id);
          if (user) upsertInto(db, user);
        });
        context.setSessionUserId(user?.id ?? null);
      },
    },
  };
}
