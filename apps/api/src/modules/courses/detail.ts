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
  const [detail] = await loadCourseDetails(db, [course]);
  if (!detail) throw new Error('Course detail missing');
  return detail;
}

/**
 * Courses with their curriculum, in the order given. The number of queries is fixed (one per
 * table), however many courses are loaded, so lists do not pay one query set per course.
 */
export async function loadCourseDetails(db: Reader, rows: CourseRow[]): Promise<CourseDetail[]> {
  if (rows.length === 0) return [];
  const courseIds = rows.map((row) => row.id);
  const courseTexts = await db
    .select()
    .from(courseTranslations)
    .where(inArray(courseTranslations.courseId, courseIds));

  const moduleRows = await db
    .select()
    .from(modules)
    .where(inArray(modules.courseId, courseIds))
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

  return rows.map((course) => ({
    ...toCourse(course, courseTexts),
    modules: moduleRows
      .filter((row) => row.courseId === course.id)
      .map((row) => ({
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
  }));
}
