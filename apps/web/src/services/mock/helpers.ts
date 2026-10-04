import {
  computeGrantStatus,
  flattenLessons,
  summarizeCourseProgress,
  type CourseDetail,
  type CourseModuleWithLessons,
  type Grant,
  type Lesson,
  type User,
} from '@opencourse/shared';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import type { MockDatabase } from './store';

export function findCourseById(db: MockDatabase, courseId: string): CourseDetail {
  const course = db.courses.find((candidate) => candidate.id === courseId);
  if (!course) throw new ServiceError('not_found', `Course not found: ${courseId}`);
  return course;
}

export function findUserById(db: MockDatabase, userId: string): User {
  const user = db.users.find((candidate) => candidate.id === userId);
  if (!user) throw new ServiceError('not_found', `User not found: ${userId}`);
  return user;
}

export function findLesson(
  db: MockDatabase,
  lessonId: string,
): { course: CourseDetail; lesson: Lesson } {
  for (const course of db.courses) {
    const lesson = flattenLessons(course).find((candidate) => candidate.id === lessonId);
    if (lesson) return { course, lesson };
  }
  throw new ServiceError('not_found', `Lesson not found: ${lessonId}`);
}

/** Finds a module and the course it belongs to. */
export function findModule(
  db: MockDatabase,
  moduleId: string,
): { course: CourseDetail; courseModule: CourseModuleWithLessons } {
  for (const course of db.courses) {
    const courseModule = course.modules.find((candidate) => candidate.id === moduleId);
    if (courseModule) return { course, courseModule };
  }
  throw new ServiceError('not_found', `Module not found: ${moduleId}`);
}

/** Grant with its effective status (past-due ones show up as `expired`). */
export function withEffectiveStatus(grant: Grant, now: Date): Grant {
  return { ...grant, status: computeGrantStatus(grant, now) };
}

export function findActiveGrant(
  db: MockDatabase,
  userId: string,
  courseId: string,
  now: Date,
): Grant | undefined {
  return db.grants
    .filter((grant) => grant.userId === userId && grant.courseId === courseId)
    .map((grant) => withEffectiveStatus(grant, now))
    .find((grant) => grant.status === 'active');
}

/**
 * The course instructor and admins always have access; students need an active grant and a
 * published course (drafts and archived courses are hidden from them).
 */
export function canReadCourse(
  db: MockDatabase,
  user: User,
  course: CourseDetail,
  now: Date,
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'instructor' && course.instructorId === user.id) return true;
  return (
    course.status === 'published' && findActiveGrant(db, user.id, course.id, now) !== undefined
  );
}

/** The course owner instructor or an admin can manage access and students. */
export function canManageCourse(user: User, course: CourseDetail): boolean {
  return user.role === 'admin' || (user.role === 'instructor' && user.id === course.instructorId);
}

export function getCompletedLessonIds(
  db: MockDatabase,
  userId: string,
  course: CourseDetail,
): Set<string> {
  const lessonIds = new Set(flattenLessons(course).map((lesson) => lesson.id));
  return new Set(
    db.progress
      .filter(
        (entry) => entry.userId === userId && entry.completed && lessonIds.has(entry.lessonId),
      )
      .map((entry) => entry.lessonId),
  );
}

export function summarizeUserCourse(db: MockDatabase, userId: string, course: CourseDetail) {
  return summarizeCourseProgress(course, getCompletedLessonIds(db, userId, course));
}

/** Date of the user's most recent activity in the course. */
export function getLastActivityAt(
  db: MockDatabase,
  userId: string,
  course: CourseDetail,
): string | null {
  const lessonIds = new Set(flattenLessons(course).map((lesson) => lesson.id));
  const dates = db.progress
    .filter((entry) => entry.userId === userId && lessonIds.has(entry.lessonId))
    .map((entry) => entry.updatedAt)
    .sort();
  return dates.at(-1) ?? null;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Public certificate code in the `OC-XXXX-XXXX` format, with no ambiguous characters. */
export function generateCertificateCode(context: MockContext): string {
  const block = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(context.random() * CODE_ALPHABET.length)] ?? 'A',
    ).join('');
  return `OC-${block()}-${block()}`;
}

/** Issues the certificate when the student completes all lessons and does not have one yet. */
export function issueCertificateIfComplete(
  context: MockContext,
  userId: string,
  course: CourseDetail,
): void {
  const db = context.store.db;
  if (!course.certificateTemplate.enabled) return;
  const summary = summarizeUserCourse(db, userId, course);
  const alreadyIssued = db.certificates.some(
    (certificate) => certificate.userId === userId && certificate.courseId === course.id,
  );
  if (!summary.isComplete || alreadyIssued) return;

  context.store.mutate((database) => {
    let code = generateCertificateCode(context);
    while (database.certificates.some((certificate) => certificate.code === code)) {
      code = generateCertificateCode(context);
    }
    database.certificates.push({
      id: context.store.nextId('cert'),
      userId,
      courseId: course.id,
      code,
      issuedAt: context.now().toISOString(),
    });
  });
}
