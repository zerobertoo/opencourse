import {
  computeGrantStatus,
  flattenLessons,
  summarizeCourseProgress,
  type CourseDetail,
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

/** Concessão com o status efetivo (vencidas aparecem como `expired`). */
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

/** Instrutor do curso e admin sempre acessam; alunos precisam de uma concessão ativa. */
export function canReadCourse(
  db: MockDatabase,
  user: User,
  course: CourseDetail,
  now: Date,
): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'instructor' && course.instructorId === user.id) return true;
  return findActiveGrant(db, user.id, course.id, now) !== undefined;
}

/** Instrutor dono do curso ou admin podem administrar acessos e alunos. */
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

/** Data da atividade mais recente do usuário no curso. */
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

/** Código público de certificado no formato `OC-XXXX-XXXX`, sem caracteres ambíguos. */
export function generateCertificateCode(context: MockContext): string {
  const block = () =>
    Array.from(
      { length: 4 },
      () => CODE_ALPHABET[Math.floor(context.random() * CODE_ALPHABET.length)] ?? 'A',
    ).join('');
  return `OC-${block()}-${block()}`;
}

/** Emite o certificado quando o aluno conclui todas as aulas e ainda não possui um. */
export function issueCertificateIfComplete(
  context: MockContext,
  userId: string,
  course: CourseDetail,
): void {
  const db = context.store.db;
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
