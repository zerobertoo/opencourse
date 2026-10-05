import type { CourseDetail } from '@opencourse/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { courses, lessons, modules, type CourseRow, type LessonRow } from '../../db/schema';
import { notFound } from '../../errors';
import type { Database } from '../../plugins/db';
import { loadCourseDetail } from './detail';
import { assertPublishable } from './publish';

type Reader = Pick<Database, 'select'>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The course that owns a module, or undefined when the module does not exist. */
export async function findCourseOfModule(
  db: Reader,
  moduleId: string,
): Promise<CourseRow | undefined> {
  const [row] = await db
    .select({ course: courses })
    .from(modules)
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(modules.id, moduleId));
  return row?.course;
}

/** A lesson with the course that owns it, or undefined when the lesson does not exist. */
export async function findCourseOfLesson(
  db: Reader,
  lessonId: string,
): Promise<{ course: CourseRow; lesson: LessonRow } | undefined> {
  const [row] = await db
    .select({ course: courses, lesson: lessons })
    .from(lessons)
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(lessons.id, lessonId));
  return row;
}

export async function nextModulePosition(tx: Transaction, courseId: string): Promise<number> {
  const [row] = await tx
    .select({ next: sql<number>`coalesce(max(${modules.position}) + 1, 0)`.mapWith(Number) })
    .from(modules)
    .where(eq(modules.courseId, courseId));
  return row?.next ?? 0;
}

export async function nextLessonPosition(tx: Transaction, moduleId: string): Promise<number> {
  const [row] = await tx
    .select({ next: sql<number>`coalesce(max(${lessons.position}) + 1, 0)`.mapWith(Number) })
    .from(lessons)
    .where(eq(lessons.moduleId, moduleId));
  return row?.next ?? 0;
}

/** True when `listed` names every id of `existing` exactly once and nothing else. */
export function listsEachOnce(listed: string[], existing: string[]): boolean {
  const known = new Set(existing);
  return (
    listed.length === known.size &&
    new Set(listed).size === listed.length &&
    listed.every((id) => known.has(id))
  );
}

/** Rewrites module and lesson positions as 0, 1, 2... keeping the current order. */
async function renumberCurriculum(tx: Transaction, courseId: string): Promise<void> {
  const moduleRows = await tx
    .select({ id: modules.id, position: modules.position })
    .from(modules)
    .where(eq(modules.courseId, courseId))
    .orderBy(asc(modules.position), asc(modules.id));
  for (const [index, row] of moduleRows.entries()) {
    if (row.position !== index) {
      await tx.update(modules).set({ position: index }).where(eq(modules.id, row.id));
    }
  }
  if (moduleRows.length === 0) return;

  const lessonRows = await tx
    .select({ id: lessons.id, moduleId: lessons.moduleId, position: lessons.position })
    .from(lessons)
    .where(
      inArray(
        lessons.moduleId,
        moduleRows.map((row) => row.id),
      ),
    )
    .orderBy(asc(lessons.position), asc(lessons.id));
  const nextIndexByModule = new Map<string, number>();
  for (const row of lessonRows) {
    const index = nextIndexByModule.get(row.moduleId) ?? 0;
    nextIndexByModule.set(row.moduleId, index + 1);
    if (row.position !== index) {
      await tx.update(lessons).set({ position: index }).where(eq(lessons.id, row.id));
    }
  }
}

/**
 * Applies a curriculum change in one transaction. The course row is locked first, so
 * concurrent edits of the same course queue up instead of taking the same positions; then the
 * change runs, positions are renumbered, `updatedAt` moves and a published course must stay
 * publishable (see `assertPublishable`). Authorization happens before this call.
 *
 * @param options.checkPublish false only for creations, which cannot break anything already published
 * @returns the course as the change left it, and whatever the change returned
 */
export async function changeCurriculum<T>(
  db: Database,
  courseId: string,
  options: { checkPublish: boolean },
  change: (tx: Transaction, course: CourseRow) => Promise<T>,
): Promise<{ course: CourseDetail; result: T }> {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(courses).where(eq(courses.id, courseId)).for('update');
    if (!locked) throw notFound('Course not found');
    const before =
      options.checkPublish && locked.status === 'published'
        ? await loadCourseDetail(tx, locked)
        : null;

    const result = await change(tx, locked);
    await renumberCurriculum(tx, locked.id);
    const [updated] = await tx
      .update(courses)
      .set({ updatedAt: new Date() })
      .where(eq(courses.id, locked.id))
      .returning();
    if (!updated) throw notFound('Course not found');

    const course = await loadCourseDetail(tx, updated);
    if (options.checkPublish) assertPublishable(before, course);
    return { course, result };
  });
}
