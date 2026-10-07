import {
  summarizeCourseProgress,
  type CourseDetail,
  type CourseProgressSummary,
} from '@opencourse/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { lessons, modules, progress } from '../../db/schema';
import type { Database } from '../../plugins/db';

/** What one student did in one course. */
export interface StudentCourseProgress {
  completed: Set<string>;
  /** Saved video position per lesson, in seconds. */
  positions: Map<string, number>;
  /** The latest `updated_at` among the student's records in the course; any write counts. */
  lastActivityAt: Date | null;
}

export const studentCourseKey = (courseId: string, userId: string) => `${courseId}:${userId}`;

const EMPTY: StudentCourseProgress = {
  completed: new Set(),
  positions: new Map(),
  lastActivityAt: null,
};

/**
 * Progress of the given students in the given courses, keyed by `studentCourseKey`. A student
 * without records has no entry (use `progressOf`). One query, however many courses and students.
 */
export async function loadStudentProgress(
  db: Pick<Database, 'select'>,
  courseIds: string[],
  userIds: string[],
): Promise<Map<string, StudentCourseProgress>> {
  const result = new Map<string, StudentCourseProgress>();
  if (courseIds.length === 0 || userIds.length === 0) return result;

  const rows = await db
    .select({ courseId: modules.courseId, record: progress })
    .from(progress)
    .innerJoin(lessons, eq(lessons.id, progress.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .where(and(inArray(modules.courseId, courseIds), inArray(progress.userId, userIds)));

  for (const { courseId, record } of rows) {
    const key = studentCourseKey(courseId, record.userId);
    let entry = result.get(key);
    if (!entry) {
      entry = { completed: new Set(), positions: new Map(), lastActivityAt: null };
      result.set(key, entry);
    }
    if (record.completed) entry.completed.add(record.lessonId);
    entry.positions.set(record.lessonId, record.videoPositionSeconds);
    if (!entry.lastActivityAt || record.updatedAt > entry.lastActivityAt) {
      entry.lastActivityAt = record.updatedAt;
    }
  }
  return result;
}

export function progressOf(
  all: Map<string, StudentCourseProgress>,
  courseId: string,
  userId: string,
): StudentCourseProgress {
  return all.get(studentCourseKey(courseId, userId)) ?? EMPTY;
}

/** Summary over the current curriculum, so lessons added later lower the percentage. */
export function summarizeStudent(
  detail: CourseDetail,
  entry: StudentCourseProgress,
): CourseProgressSummary {
  return summarizeCourseProgress(detail, entry.completed);
}
