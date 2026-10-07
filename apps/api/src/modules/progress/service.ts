import {
  flattenLessons,
  getUnlockedLessonIds,
  summarizeCourseProgress,
  type CourseDetail,
  type DomainEventMap,
  type DomainEventName,
  type LessonNote,
  type Progress,
  type Quiz,
  type QuizAttempt,
} from '@opencourse/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  progress,
  type LessonRow,
  type CourseRow,
  type LessonNoteRow,
  type ProgressRow,
  type QuizAttemptRow,
  type UserRow,
} from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../errors';
import type { Database } from '../../plugins/db';
import { resolveCourseAccess } from '../courses/access';
import { findCourseOfLesson, type Transaction } from '../courses/curriculum';

type Reader = Pick<Database, 'select'>;

export interface PendingEvent<Name extends DomainEventName = DomainEventName> {
  name: Name;
  payload: DomainEventMap[Name];
}

export function toProgress(row: ProgressRow): Progress {
  return {
    userId: row.userId,
    lessonId: row.lessonId,
    completed: row.completed,
    videoPositionSeconds: row.videoPositionSeconds,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toNote(row: LessonNoteRow): LessonNote {
  return {
    userId: row.userId,
    lessonId: row.lessonId,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toQuizAttempt(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    userId: row.userId,
    lessonId: row.lessonId,
    answers: row.answers,
    score: row.score,
    passed: row.passed,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface StudyContext {
  course: CourseRow;
  lesson: LessonRow;
}

/**
 * The lesson the caller may study now. Unknown lessons and lessons of invisible courses answer the
 * same 404; a visible course without a grant answers 403. A revoked or expired grant is the same
 * as no grant: the progress is kept, but nothing is readable or writable until access returns.
 */
export async function requireReadableLesson(
  db: Reader,
  user: UserRow,
  lessonId: string,
): Promise<StudyContext> {
  const found = await findCourseOfLesson(db, lessonId);
  if (!found) throw notFound('Lesson not found');
  const access = await resolveCourseAccess(db, user, found.course, new Date());
  if (!access.isVisible) throw notFound('Lesson not found');
  if (!access.canViewContent) throw forbidden('Access to this course requires a grant');
  return found;
}

/** Lessons of the course the user has completed. */
export async function loadCompletedLessonIds(
  db: Reader,
  userId: string,
  detail: CourseDetail,
): Promise<Set<string>> {
  const lessonIds = flattenLessons(detail).map((lesson) => lesson.id);
  if (lessonIds.length === 0) return new Set();
  const rows = await db
    .select({ lessonId: progress.lessonId })
    .from(progress)
    .where(
      and(
        eq(progress.userId, userId),
        eq(progress.completed, true),
        inArray(progress.lessonId, lessonIds),
      ),
    );
  return new Set(rows.map((row) => row.lessonId));
}

/** Sequential courses only open the next lesson once the previous ones are completed. */
export function requireUnlocked(
  detail: CourseDetail,
  completed: ReadonlySet<string>,
  lessonId: string,
): void {
  if (!getUnlockedLessonIds(detail, completed).has(lessonId)) {
    throw forbidden('Complete the previous lessons first');
  }
}

/**
 * Serializes one student's writes in one course, so two requests completing the same lesson at
 * once cannot both see it as "not completed" and announce it twice. Released with the transaction.
 */
export async function lockStudentCourse(
  tx: Transaction,
  userId: string,
  courseId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`progress:${userId}:${courseId}`}, 0))`,
  );
}

export interface ProgressPatch {
  completed?: boolean;
  videoPositionSeconds?: number;
}

/** Creates or updates the record. Fields left out keep their value; the activity time moves. */
export async function upsertProgress(
  tx: Transaction,
  userId: string,
  lessonId: string,
  patch: ProgressPatch,
  now: Date,
): Promise<ProgressRow> {
  const [row] = await tx
    .insert(progress)
    .values({
      userId,
      lessonId,
      completed: patch.completed ?? false,
      videoPositionSeconds: patch.videoPositionSeconds ?? 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [progress.userId, progress.lessonId],
      set: {
        completed: patch.completed,
        videoPositionSeconds: patch.videoPositionSeconds,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) throw new Error('Failed to save progress');
  return row;
}

/**
 * Events caused by completing `lessonId`: the lesson (when it was not completed before) and the
 * course (when this write is the one that finished it).
 */
export function completionEvents(
  detail: CourseDetail,
  userId: string,
  lessonId: string,
  completedBefore: ReadonlySet<string>,
): PendingEvent[] {
  if (completedBefore.has(lessonId)) return [];
  const after = new Set(completedBefore).add(lessonId);
  const events: PendingEvent[] = [
    { name: 'lesson.completed', payload: { userId, courseId: detail.id, lessonId } },
  ];
  // completing again after un-completing announces again: deduplication belongs to the consumers
  if (summarizeCourseProgress(detail, after).isComplete) {
    events.push({ name: 'course.completed', payload: { userId, courseId: detail.id } });
  }
  return events;
}

/** Answers must name real questions and real options of those questions. */
export function assertAnswersBelongToQuiz(quiz: Quiz, answers: Record<string, string>): void {
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = quiz.questions.find((candidate) => candidate.id === questionId);
    if (!question) throw badRequest('Answer for a question that is not in this quiz');
    if (!question.options.some((option) => option.id === optionId)) {
      throw badRequest('Answer with an option that does not belong to the question');
    }
  }
}
