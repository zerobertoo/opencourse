import {
  courseIdParamsSchema,
  courseProgressResponseSchema,
  gradeQuiz,
  lessonIdParamsSchema,
  listQuizAttemptsResponseSchema,
  noteResponseSchema,
  progressResponseSchema,
  saveNoteRequestSchema,
  quizLessonParamsSchema,
  quizSubmissionResponseSchema,
  submitQuizRequestSchema,
  updateProgressRequestSchema,
} from '@opencourse/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, lessonNotes, lessons, modules, progress, quizAttempts } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../errors';
import { resolveCourseAccess } from '../courses/access';
import { loadCourseDetail } from '../courses/detail';
import {
  assertAnswersBelongToQuiz,
  completionEvents,
  loadCompletedLessonIds,
  lockStudentCourse,
  requireReadableLesson,
  requireUnlocked,
  toNote,
  toProgress,
  toQuizAttempt,
  upsertProgress,
  type PendingEvent,
} from './service';

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  const publish = (events: PendingEvent[]) => {
    for (const event of events) app.events.emit(event.name, event.payload as never);
  };

  app.get(
    '/courses/:id/progress',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: "The caller's progress records in a course",
        params: courseIdParamsSchema,
        response: { 200: courseProgressResponseSchema },
      },
    },
    async (request) => {
      const [course] = await app.db.select().from(courses).where(eq(courses.id, request.params.id));
      if (!course) throw notFound('Course not found');
      const access = await resolveCourseAccess(app.db, request.auth!.user, course, new Date());
      if (!access.isVisible) throw notFound('Course not found');
      if (!access.canViewContent) throw forbidden('Access to this course requires a grant');

      const rows = await app.db
        .select({ row: progress })
        .from(progress)
        .innerJoin(lessons, eq(lessons.id, progress.lessonId))
        .innerJoin(modules, eq(modules.id, lessons.moduleId))
        .where(and(eq(progress.userId, request.auth!.user.id), eq(modules.courseId, course.id)))
        .orderBy(asc(progress.updatedAt));
      return { progress: rows.map(({ row }) => toProgress(row)) };
    },
  );

  app.put(
    '/lessons/:id/progress',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: 'Mark a lesson completed or not, and save the video position',
        description:
          'Fields left out keep their value. Quiz lessons complete only by passing the quiz. ' +
          'Locked lessons of sequential courses refuse completion and position saves.',
        params: lessonIdParamsSchema,
        body: updateProgressRequestSchema,
        response: { 200: progressResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { completed, videoPositionSeconds } = request.body;
      const now = new Date();

      const { row, events } = await app.db.transaction(async (tx) => {
        const { course, lesson } = await requireReadableLesson(tx, user, request.params.id);
        await lockStudentCourse(tx, user.id, course.id);
        if (completed === true && lesson.type === 'quiz') {
          throw badRequest('A quiz lesson is completed by passing the quiz');
        }
        if (videoPositionSeconds !== undefined && lesson.type !== 'video') {
          throw badRequest('Only video lessons have a playback position');
        }

        const detail = await loadCourseDetail(tx, course);
        const completedBefore = await loadCompletedLessonIds(tx, user.id, detail);
        // taking a completion back is always allowed; everything else needs the lesson open
        if (completed !== false || videoPositionSeconds !== undefined) {
          requireUnlocked(detail, completedBefore, lesson.id);
        }

        const saved = await upsertProgress(
          tx,
          user.id,
          lesson.id,
          {
            completed,
            videoPositionSeconds:
              videoPositionSeconds === undefined
                ? undefined
                : // a duration of 0 means "not filled in yet", not "ends at 0:00"
                  lesson.durationSeconds > 0
                  ? Math.min(videoPositionSeconds, lesson.durationSeconds)
                  : videoPositionSeconds,
          },
          now,
        );
        return {
          row: saved,
          events:
            completed === true ? completionEvents(detail, user.id, lesson.id, completedBefore) : [],
        };
      });
      // announced only once the row is committed
      publish(events);
      return { progress: toProgress(row) };
    },
  );

  app.get(
    '/quizzes/:lessonId/attempts',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: "The caller's attempts at a quiz, oldest first",
        params: quizLessonParamsSchema,
        response: { 200: listQuizAttemptsResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { lesson } = await requireReadableLesson(app.db, user, request.params.lessonId);
      const rows = await app.db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.userId, user.id), eq(quizAttempts.lessonId, lesson.id)))
        .orderBy(asc(quizAttempts.createdAt), asc(quizAttempts.id));
      return { attempts: rows.map(toQuizAttempt) };
    },
  );

  app.post(
    '/quizzes/:lessonId/attempts',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: 'Submit answers to a quiz',
        description:
          'Graded on the server; attempts are unlimited. Passing completes the lesson; a later failed attempt does not undo it. ' +
          'The response carries per-question feedback, and the correct option only when the attempt passed.',
        params: quizLessonParamsSchema,
        body: submitQuizRequestSchema,
        response: { 201: quizSubmissionResponseSchema },
      },
    },
    async (request, reply) => {
      const { user } = request.auth!;
      const { answers } = request.body;
      const now = new Date();

      const { attempt, feedback, events } = await app.db.transaction(async (tx) => {
        const { course, lesson } = await requireReadableLesson(tx, user, request.params.lessonId);
        await lockStudentCourse(tx, user.id, course.id);
        const quiz = lesson.type === 'quiz' ? lesson.quiz : null;
        if (!quiz || quiz.questions.length === 0)
          throw badRequest('This lesson has no quiz to take');
        assertAnswersBelongToQuiz(quiz, answers);

        const detail = await loadCourseDetail(tx, course);
        const completedBefore = await loadCompletedLessonIds(tx, user.id, detail);
        requireUnlocked(detail, completedBefore, lesson.id);

        const graded = gradeQuiz(quiz, answers);
        const [saved] = await tx
          .insert(quizAttempts)
          .values({
            userId: user.id,
            lessonId: lesson.id,
            answers,
            score: graded.score,
            passed: graded.passed,
            createdAt: now,
          })
          .returning();
        if (!saved) throw new Error('Failed to save the attempt');

        let pending: PendingEvent[] = [];
        if (graded.passed) {
          await upsertProgress(tx, user.id, lesson.id, { completed: true }, now);
          pending = completionEvents(detail, user.id, lesson.id, completedBefore);
        }
        return { attempt: saved, feedback: graded, events: pending };
      });
      publish(events);
      return reply.code(201).send({ attempt: toQuizAttempt(attempt), feedback });
    },
  );
  app.get(
    '/lessons/:id/note',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: "The caller's personal note on a lesson",
        params: lessonIdParamsSchema,
        response: { 200: noteResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { lesson } = await requireReadableLesson(app.db, user, request.params.id);
      const [row] = await app.db
        .select()
        .from(lessonNotes)
        .where(and(eq(lessonNotes.userId, user.id), eq(lessonNotes.lessonId, lesson.id)));
      return { note: row ? toNote(row) : null };
    },
  );

  app.put(
    '/lessons/:id/note',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['progress'],
        summary: 'Save the personal note on a lesson',
        description: 'Blank text erases the note and answers null.',
        params: lessonIdParamsSchema,
        body: saveNoteRequestSchema,
        response: { 200: noteResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { content } = request.body;
      const { lesson } = await requireReadableLesson(app.db, user, request.params.id);

      if (content.trim() === '') {
        await app.db
          .delete(lessonNotes)
          .where(and(eq(lessonNotes.userId, user.id), eq(lessonNotes.lessonId, lesson.id)));
        return { note: null };
      }
      const now = new Date();
      const [row] = await app.db
        .insert(lessonNotes)
        .values({ userId: user.id, lessonId: lesson.id, content, updatedAt: now })
        .onConflictDoUpdate({
          target: [lessonNotes.userId, lessonNotes.lessonId],
          set: { content, updatedAt: now },
        })
        .returning();
      return { note: row ? toNote(row) : null };
    },
  );
};
