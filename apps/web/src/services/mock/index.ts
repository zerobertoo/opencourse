import type { Course, CourseDetail, Grant, User } from '@opencourse/shared';
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
    /** Adds or replaces a course read in full from the real API. */
    upsertCourse(course: CourseDetail): void;
    /**
     * Adds or refreshes a course known only as a summary. A curriculum already mirrored for the
     * course is kept, so listing never erases what an earlier read brought in.
     */
    upsertCourseSummary(course: Course): void;
    /** Adds or replaces a grant by id. */
    upsertGrant(grant: Grant): void;
    /** Makes `grant` the user's only mirrored grant for the course; null removes them all. */
    setOwnGrant(userId: string, courseId: string, grant: Grant | null): void;
    /**
     * After a full catalog read: forgets the user's mirrored grants and the courses (other than
     * the ones they manage) that the catalog no longer lists, such as a course archived or whose
     * access was revoked meanwhile.
     */
    dropUnlisted(userId: string, listedCourseIds: string[]): void;
  };
}

function upsertInto(db: MockDatabase, user: User): void {
  const index = db.users.findIndex((candidate) => candidate.id === user.id);
  if (index >= 0) db.users[index] = clone(user);
  else db.users.push(clone(user));
}

function upsertGrantInto(db: MockDatabase, grant: Grant): void {
  const index = db.grants.findIndex((candidate) => candidate.id === grant.id);
  if (index >= 0) db.grants[index] = clone(grant);
  else db.grants.push(clone(grant));
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
    mock: {
      store: context.store,
      upsertUser: (user) => context.store.mutate((db) => upsertInto(db, user)),
      sessionUserId: () => context.getSessionUserId(),
      upsertCourse: (course) =>
        context.store.mutate((db) => {
          const index = db.courses.findIndex((candidate) => candidate.id === course.id);
          if (index >= 0) db.courses[index] = clone(course);
          else db.courses.push(clone(course));
        }),
      upsertCourseSummary: (course) =>
        context.store.mutate((db) => {
          const existing = db.courses.find((candidate) => candidate.id === course.id);
          if (existing) Object.assign(existing, clone(course));
          else db.courses.push({ ...clone(course), modules: [] });
        }),
      upsertGrant: (grant) => context.store.mutate((db) => upsertGrantInto(db, grant)),
      setOwnGrant: (userId, courseId, grant) =>
        context.store.mutate((db) => {
          db.grants = db.grants.filter(
            (candidate) =>
              candidate.userId !== userId ||
              candidate.courseId !== courseId ||
              candidate.id === grant?.id,
          );
          if (grant) upsertGrantInto(db, grant);
        }),
      dropUnlisted: (userId, listedCourseIds) =>
        context.store.mutate((db) => {
          const listed = new Set(listedCourseIds);
          const manager = db.users.find((candidate) => candidate.id === userId);
          db.grants = db.grants.filter(
            (candidate) => candidate.userId !== userId || listed.has(candidate.courseId),
          );
          db.courses = db.courses.filter(
            (course) =>
              listed.has(course.id) || manager?.role === 'admin' || course.instructorId === userId,
          );
        }),
      setSessionUser(user) {
        const previousUserId = context.getSessionUserId();
        context.store.mutate((db) => {
          // a different account (or nobody) means the previous mirrored accounts must go
          purgeMirroredUsers(db, seedUserIds, user?.id);
          // with the real API owning the data, courses and grants belong to the account that
          // read them: the next person on this tab must not inherit them
          if (options.mode === 'api' && previousUserId !== null && previousUserId !== user?.id) {
            db.courses = [];
            db.grants = [];
          }
          if (user) upsertInto(db, user);
        });
        context.setSessionUserId(user?.id ?? null);
      },
    },
  };
}
