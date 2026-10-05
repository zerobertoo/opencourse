import type { Course, CourseDetail, Lesson } from '@opencourse/shared';
import { asc, inArray } from 'drizzle-orm';
import {
  courseTranslations,
  lessons,
  lessonTranslations,
  moduleTranslations,
  modules,
  type CourseRow,
  type CourseTranslationRow,
  type LessonRow,
  type LessonTranslationRow,
} from '../../db/schema';
import { toLocale } from '../../mappers';
import type { Database } from '../../plugins/db';

type Reader = Pick<Database, 'select'>;

function byLocale<T extends { locale: string }>(a: T, b: T): number {
  return a.locale.localeCompare(b.locale);
}

function toCourse(row: CourseRow, translations: CourseTranslationRow[]): Course {
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    coverImageUrl: row.coverImageUrl,
    instructorId: row.instructorId,
    defaultLocale: toLocale(row.defaultLocale),
    sequentialOrder: row.sequentialOrder,
    certificateTemplate: row.certificateTemplate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    translations: translations
      .filter((item) => item.courseId === row.id)
      .sort(byLocale)
      .map((item) => ({
        locale: toLocale(item.locale),
        title: item.title,
        description: item.description,
        learningOutcomes: item.learningOutcomes,
      })),
  };
}

/** Courses without their curriculum, translations loaded in one query. */
export async function loadCourseSummaries(db: Reader, rows: CourseRow[]): Promise<Course[]> {
  if (rows.length === 0) return [];
  const translations = await db
    .select()
    .from(courseTranslations)
    .where(
      inArray(
        courseTranslations.courseId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => toCourse(row, translations));
}

function toLesson(row: LessonRow, translations: LessonTranslationRow[]): Lesson {
  const base = {
    id: row.id,
    moduleId: row.moduleId,
    order: row.position,
    durationSeconds: row.durationSeconds,
    // attachments need the storage adapter (milestone 4b)
    attachments: [],
    translations: translations
      .filter((item) => item.lessonId === row.id)
      .sort(byLocale)
      .map((item) => ({ locale: toLocale(item.locale), title: item.title, content: item.content })),
  };
  switch (row.type) {
    case 'video':
      return { ...base, type: 'video', video: row.video, captions: row.captions };
    case 'text':
      return { ...base, type: 'text' };
    case 'file':
      return { ...base, type: 'file' };
    case 'quiz':
      return { ...base, type: 'quiz', quiz: row.quiz ?? { passingScore: 70, questions: [] } };
  }
}

/** The course with modules and lessons in study order. */
export async function loadCourseDetail(db: Reader, course: CourseRow): Promise<CourseDetail> {
  const [summary] = await loadCourseSummaries(db, [course]);
  if (!summary) throw new Error('Course summary missing');

  const moduleRows = await db
    .select()
    .from(modules)
    .where(inArray(modules.courseId, [course.id]))
    .orderBy(asc(modules.position));
  const moduleIds = moduleRows.map((row) => row.id);
  const moduleTitles = moduleIds.length
    ? await db
        .select()
        .from(moduleTranslations)
        .where(inArray(moduleTranslations.moduleId, moduleIds))
    : [];
  const lessonRows = moduleIds.length
    ? await db
        .select()
        .from(lessons)
        .where(inArray(lessons.moduleId, moduleIds))
        .orderBy(asc(lessons.position))
    : [];
  const lessonIds = lessonRows.map((row) => row.id);
  const lessonTexts = lessonIds.length
    ? await db
        .select()
        .from(lessonTranslations)
        .where(inArray(lessonTranslations.lessonId, lessonIds))
    : [];

  return {
    ...summary,
    modules: moduleRows.map((row) => ({
      id: row.id,
      courseId: row.courseId,
      order: row.position,
      translations: moduleTitles
        .filter((item) => item.moduleId === row.id)
        .sort(byLocale)
        .map((item) => ({ locale: toLocale(item.locale), title: item.title })),
      lessons: lessonRows
        .filter((lesson) => lesson.moduleId === row.id)
        .map((lesson) => toLesson(lesson, lessonTexts)),
    })),
  };
}
