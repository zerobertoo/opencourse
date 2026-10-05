import type { CourseStatus, LessonType, Locale, Quiz } from '@opencourse/shared';
import type { FastifyInstance } from 'fastify';
import {
  courses,
  courseTranslations,
  grants,
  lessons,
  lessonTranslations,
  moduleTranslations,
  modules,
  type CourseRow,
  type GrantRow,
  type LessonRow,
  type ModuleRow,
} from '../src/db/schema';
import { registerClient } from './helpers';

/** Registered users: the first account of an instance is the admin, the others are promoted. */
export async function createCast(app: FastifyInstance) {
  const admin = await registerClient(app, 'admin@example.com', 'Ada Admin');
  const instructorA = await registerClient(app, 'ines@example.com', 'Ines Instructor');
  const instructorB = await registerClient(app, 'ivo@example.com', 'Ivo Instructor');
  const student = await registerClient(app, 'sam@example.com', 'Sam Student');
  const otherStudent = await registerClient(app, 'olga@example.com', 'Olga Student');
  for (const instructor of [instructorA, instructorB]) {
    const response = await admin.client.patch(`/api/v1/admin/users/${instructor.userId}/role`, {
      role: 'instructor',
    });
    if (response.statusCode !== 200) throw new Error(`promotion failed: ${response.body}`);
  }
  return { admin, instructorA, instructorB, student, otherStudent };
}

let counter = 0;

export async function insertCourse(
  app: FastifyInstance,
  input: {
    instructorId: string;
    slug?: string;
    status?: CourseStatus;
    defaultLocale?: Locale;
    title?: string;
    sequentialOrder?: boolean;
  },
): Promise<CourseRow> {
  counter += 1;
  const locale = input.defaultLocale ?? 'en';
  const [course] = await app.db
    .insert(courses)
    .values({
      slug: input.slug ?? `course-${counter}`,
      status: input.status ?? 'published',
      instructorId: input.instructorId,
      defaultLocale: locale,
      sequentialOrder: input.sequentialOrder ?? false,
      certificateTemplate: { enabled: true, signatoryName: 'Ines', signatoryRole: '', message: '' },
    })
    .returning();
  if (!course) throw new Error('insertCourse failed');
  await app.db.insert(courseTranslations).values({
    courseId: course.id,
    locale,
    title: input.title ?? `Course ${counter}`,
    description: 'About the course',
    learningOutcomes: [],
  });
  return course;
}

export async function insertModule(
  app: FastifyInstance,
  courseId: string,
  position: number,
  title: string,
  locale: Locale = 'en',
): Promise<ModuleRow> {
  const [row] = await app.db.insert(modules).values({ courseId, position }).returning();
  if (!row) throw new Error('insertModule failed');
  await app.db.insert(moduleTranslations).values({ moduleId: row.id, locale, title });
  return row;
}

export async function insertLesson(
  app: FastifyInstance,
  moduleId: string,
  position: number,
  input: {
    title: string;
    type?: LessonType;
    quiz?: Quiz;
    locale?: Locale;
    durationSeconds?: number;
  },
): Promise<LessonRow> {
  const [row] = await app.db
    .insert(lessons)
    .values({
      moduleId,
      position,
      type: input.type ?? 'text',
      durationSeconds: input.durationSeconds ?? 60,
      quiz: input.quiz ?? null,
    })
    .returning();
  if (!row) throw new Error('insertLesson failed');
  await app.db.insert(lessonTranslations).values({
    lessonId: row.id,
    locale: input.locale ?? 'en',
    title: input.title,
    content: '',
  });
  return row;
}

export async function insertGrant(
  app: FastifyInstance,
  input: {
    userId: string;
    courseId: string;
    createdById: string;
    expiresAt?: Date | null;
    revokedAt?: Date | null;
  },
): Promise<GrantRow> {
  const [row] = await app.db
    .insert(grants)
    .values({ source: 'manual', expiresAt: null, revokedAt: null, ...input })
    .returning();
  if (!row) throw new Error('insertGrant failed');
  return row;
}
