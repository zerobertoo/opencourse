import type { CourseCompletedEvent, LessonCompletedEvent } from '@opencourse/shared';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { progress } from '../src/db/schema';
import {
  buildQuiz,
  createCast,
  insertCourse,
  insertGrant,
  insertLesson,
  insertModule,
} from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

/** Lets the bus deliver: listeners run on a microtask after emit. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('lesson progress', () => {
  let ctx: TestApp;
  const lessonEvents: LessonCompletedEvent[] = [];
  const courseEvents: CourseCompletedEvent[] = [];
  /** What the database said about the lesson at the moment its event arrived. */
  const completedWhenAnnounced: boolean[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.app.events.on('lesson.completed', async (event) => {
      lessonEvents.push(event);
      const [row] = await ctx.app.db
        .select()
        .from(progress)
        .where(and(eq(progress.userId, event.userId), eq(progress.lessonId, event.lessonId)));
      completedWhenAnnounced.push(row?.completed === true);
    });
    ctx.app.events.on('course.completed', (event) => {
      courseEvents.push(event);
    });
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
    lessonEvents.length = 0;
    courseEvents.length = 0;
    completedWhenAnnounced.length = 0;
  });

  /** Course with text, video and quiz lessons, in that order, and a granted student. */
  async function setup(
    options: { sequentialOrder?: boolean; status?: 'published' | 'draft' } = {},
  ) {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      sequentialOrder: options.sequentialOrder ?? false,
      status: options.status ?? 'published',
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const text = await insertLesson(ctx.app, courseModule.id, 0, { title: 'Text' });
    const video = await insertLesson(ctx.app, courseModule.id, 1, {
      title: 'Video',
      type: 'video',
      durationSeconds: 100,
    });
    const quizFixture = buildQuiz();
    const quiz = await insertLesson(ctx.app, courseModule.id, 2, {
      title: 'Quiz',
      type: 'quiz',
      quiz: quizFixture.quiz,
    });
    const grant = await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    return { cast, course, text, video, quiz, quizFixture, grant };
  }

  const mark = (client: TestClient, lessonId: string, body: object) =>
    client.put(`/api/v1/lessons/${lessonId}/progress`, body);

  describe('who may study', () => {
    it('lets a student with an active grant and the managers in', async () => {
      const { cast, text, course } = await setup();
      for (const who of [cast.student, cast.instructorA, cast.admin]) {
        const response = await mark(who.client, text.id, { completed: true });
        expect(response.statusCode).toBe(200);
      }
      const list = await cast.student.client.get(`/api/v1/courses/${course.id}/progress`);
      expect(list.statusCode).toBe(200);
      expect(list.json().progress).toHaveLength(1);
    });

    it('refuses without a grant, with an expired one, and signed out', async () => {
      const { cast, text, course, grant } = await setup();
      expect((await mark(cast.otherStudent.client, text.id, { completed: true })).statusCode).toBe(
        403,
      );
      expect((await mark(cast.instructorB.client, text.id, { completed: true })).statusCode).toBe(
        403,
      );
      const anonymous = new TestClient(ctx.app);
      expect((await mark(anonymous, text.id, { completed: true })).statusCode).toBe(401);
      expect((await anonymous.get(`/api/v1/courses/${course.id}/progress`)).statusCode).toBe(401);

      await ctx.app.db.execute(
        sql`update grants set expires_at = now() - interval '1 day' where id = ${grant.id}`,
      );
      expect((await mark(cast.student.client, text.id, { completed: true })).statusCode).toBe(403);
      expect(
        (await cast.student.client.get(`/api/v1/courses/${course.id}/progress`)).statusCode,
      ).toBe(403);
    });

    it('answers the same 404 for unknown lessons and for lessons of an invisible draft', async () => {
      const { cast, text } = await setup({ status: 'draft' });
      const unknown = await mark(cast.student.client, UNKNOWN_ID, { completed: true });
      const hidden = await mark(cast.student.client, text.id, { completed: true });
      expect(unknown.statusCode).toBe(404);
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual(unknown.json());
    });

    it('keeps progress through a revocation and gives it back with a new grant', async () => {
      const { cast, text, course, grant } = await setup();
      await mark(cast.student.client, text.id, { completed: true });

      const revoked = await cast.instructorA.client.post(`/api/v1/grants/${grant.id}/revoke`);
      expect(revoked.statusCode).toBe(200);
      expect(
        (await cast.student.client.get(`/api/v1/courses/${course.id}/progress`)).statusCode,
      ).toBe(403);

      const regranted = await cast.instructorA.client.post('/api/v1/grants', {
        userId: cast.student.userId,
        courseId: course.id,
        expiresAt: null,
      });
      expect(regranted.statusCode).toBe(201);
      const back = await cast.student.client.get(`/api/v1/courses/${course.id}/progress`);
      expect(back.json().progress).toMatchObject([{ lessonId: text.id, completed: true }]);
    });
  });

  describe('completing and resuming', () => {
    it('stores completion and position independently', async () => {
      const { cast, video } = await setup();
      const position = await mark(cast.student.client, video.id, { videoPositionSeconds: 40 });
      expect(position.json().progress).toMatchObject({
        completed: false,
        videoPositionSeconds: 40,
      });

      const done = await mark(cast.student.client, video.id, { completed: true });
      expect(done.json().progress).toMatchObject({ completed: true, videoPositionSeconds: 40 });

      const moved = await mark(cast.student.client, video.id, { videoPositionSeconds: 10 });
      expect(moved.json().progress).toMatchObject({ completed: true, videoPositionSeconds: 10 });

      const undone = await mark(cast.student.client, video.id, { completed: false });
      expect(undone.json().progress).toMatchObject({ completed: false, videoPositionSeconds: 10 });
    });

    it('clamps the position to the lesson duration and refuses it on other lessons', async () => {
      const { cast, video, text } = await setup();
      const far = await mark(cast.student.client, video.id, { videoPositionSeconds: 5000 });
      expect(far.json().progress.videoPositionSeconds).toBe(100);
      const wrong = await mark(cast.student.client, text.id, { videoPositionSeconds: 5 });
      expect(wrong.statusCode).toBe(400);
    });

    it('keeps the position of a video whose duration was never filled in', async () => {
      const { cast, course } = await setup();
      const [courseModule] = await ctx.app.db
        .select()
        .from((await import('../src/db/schema')).modules)
        .limit(1);
      const unmeasured = await insertLesson(ctx.app, courseModule!.id, 9, {
        title: 'Unmeasured',
        type: 'video',
        durationSeconds: 0,
      });
      void course;
      const saved = await mark(cast.student.client, unmeasured.id, { videoPositionSeconds: 120 });
      expect(saved.json().progress.videoPositionSeconds).toBe(120);
    });

    it('rejects an empty body and unknown fields', async () => {
      const { cast, text } = await setup();
      expect((await mark(cast.student.client, text.id, {})).statusCode).toBe(400);
      const extra = await mark(cast.student.client, text.id, { completed: true, userId: 'x' });
      expect(extra.statusCode).toBe(400);
    });

    it('refuses to complete a quiz lesson by hand', async () => {
      const { cast, quiz } = await setup();
      const response = await mark(cast.student.client, quiz.id, { completed: true });
      expect(response.statusCode).toBe(400);
    });

    it('is scoped to the caller', async () => {
      const { cast, text, course } = await setup();
      await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      await mark(cast.student.client, text.id, { completed: true });
      const other = await cast.otherStudent.client.get(`/api/v1/courses/${course.id}/progress`);
      expect(other.json().progress).toEqual([]);
    });
  });

  describe('sequential courses', () => {
    it('refuses completion, position and quiz attempts on a locked lesson', async () => {
      const { cast, video, quiz, quizFixture, text } = await setup({ sequentialOrder: true });
      expect((await mark(cast.student.client, video.id, { completed: true })).statusCode).toBe(403);
      expect(
        (await mark(cast.student.client, video.id, { videoPositionSeconds: 5 })).statusCode,
      ).toBe(403);
      const attempt = await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: { [quizFixture.questionIds[0]!]: quizFixture.correct[0] },
      });
      expect(attempt.statusCode).toBe(403);

      expect((await mark(cast.student.client, text.id, { completed: true })).statusCode).toBe(200);
      expect((await mark(cast.student.client, video.id, { completed: true })).statusCode).toBe(200);
    });

    it('lets a student take a completed lesson back even when later ones are locked', async () => {
      const { cast, text, video } = await setup({ sequentialOrder: true });
      await mark(cast.student.client, text.id, { completed: true });
      await mark(cast.student.client, video.id, { completed: true });
      // the video is now behind an open lesson, but taking its completion back is still fine
      await mark(cast.student.client, text.id, { completed: false });
      const undone = await mark(cast.student.client, video.id, { completed: false });
      expect(undone.statusCode).toBe(200);
      expect(undone.json().progress.completed).toBe(false);
    });
  });

  describe('quiz attempts', () => {
    it('grades on the server and completes the lesson on a pass', async () => {
      const { cast, quiz, quizFixture, course } = await setup();
      const { questionIds, correct, wrong } = quizFixture;

      const failed = await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: { [questionIds[0]!]: wrong[0], [questionIds[1]!]: wrong[1] },
      });
      expect(failed.statusCode).toBe(201);
      expect(failed.json().attempt).toMatchObject({ score: 0, passed: false });
      expect(failed.json().feedback.results[questionIds[0]!]).toMatchObject({
        selectedOptionId: wrong[0],
        isCorrect: false,
      });
      // the right answer stays secret until the student passes
      expect(JSON.stringify(failed.json())).not.toContain(correct[0]);
      await settle();
      expect(lessonEvents).toHaveLength(0);

      const passed = await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: { [questionIds[0]!]: correct[0], [questionIds[1]!]: wrong[1] },
      });
      expect(passed.json().attempt).toMatchObject({ score: 50, passed: true });
      expect(passed.json().feedback.results[questionIds[0]!]).toMatchObject({
        isCorrect: true,
        correctOptionId: correct[0],
      });
      expect(passed.json().feedback.results[questionIds[1]!].explanation).toEqual([
        { locale: 'en', text: 'Why 2' },
      ]);

      await settle();
      expect(lessonEvents).toEqual([
        { userId: cast.student.userId, courseId: course.id, lessonId: quiz.id },
      ]);
    });

    it('keeps the lesson completed after a later failed attempt and lists every attempt', async () => {
      const { cast, quiz, quizFixture, course } = await setup();
      const { questionIds, correct, wrong } = quizFixture;
      const url = `/api/v1/quizzes/${quiz.id}/attempts`;
      await cast.student.client.post(url, {
        answers: { [questionIds[0]!]: correct[0], [questionIds[1]!]: correct[1] },
      });
      await cast.student.client.post(url, {
        answers: { [questionIds[0]!]: wrong[0], [questionIds[1]!]: wrong[1] },
      });

      const attempts = await cast.student.client.get(url);
      expect(attempts.json().attempts.map((a: { score: number }) => a.score)).toEqual([100, 0]);
      const records = await cast.student.client.get(`/api/v1/courses/${course.id}/progress`);
      expect(records.json().progress).toMatchObject([{ lessonId: quiz.id, completed: true }]);

      await settle();
      expect(lessonEvents).toHaveLength(1);
    });

    it('rejects answers that do not belong to the quiz', async () => {
      const { cast, quiz, quizFixture } = await setup();
      const { questionIds, correct } = quizFixture;
      const url = `/api/v1/quizzes/${quiz.id}/attempts`;
      const stranger = '00000000-0000-4000-8000-0000000000aa';
      const cases = [
        { [stranger]: correct[0] },
        { [questionIds[0]!]: stranger },
        // an option of another question
        { [questionIds[0]!]: correct[1] },
      ];
      for (const answers of cases) {
        expect((await cast.student.client.post(url, { answers })).statusCode).toBe(400);
      }
      expect((await cast.student.client.get(url)).json().attempts).toEqual([]);
    });

    it('treats unanswered questions as wrong and refuses non-quiz lessons', async () => {
      const { cast, quiz, text } = await setup();
      const empty = await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: {},
      });
      expect(empty.json().attempt).toMatchObject({ score: 0, passed: false });
      const notQuiz = await cast.student.client.post(`/api/v1/quizzes/${text.id}/attempts`, {
        answers: {},
      });
      expect(notQuiz.statusCode).toBe(400);
    });

    it('lists only the caller attempts and needs access', async () => {
      const { cast, quiz, quizFixture, course } = await setup();
      await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: { [quizFixture.questionIds[0]!]: quizFixture.correct[0] },
      });
      const other = await cast.otherStudent.client.get(`/api/v1/quizzes/${quiz.id}/attempts`);
      expect(other.json().attempts).toEqual([]);
      const stranger = await cast.instructorB.client.get(`/api/v1/quizzes/${quiz.id}/attempts`);
      expect(stranger.statusCode).toBe(403);
    });
  });

  describe('domain events', () => {
    it('announces a completed lesson once, after the row is saved, and not on repeats', async () => {
      const { cast, text, course } = await setup();
      await mark(cast.student.client, text.id, { completed: true });
      await mark(cast.student.client, text.id, { completed: true });
      await settle();
      expect(lessonEvents).toEqual([
        { userId: cast.student.userId, courseId: course.id, lessonId: text.id },
      ]);
      expect(completedWhenAnnounced).toEqual([true]);
      expect(courseEvents).toEqual([]);
    });

    it('announces the course when its last lesson is completed', async () => {
      const { cast, text, video, quiz, quizFixture, course } = await setup();
      const { questionIds, correct } = quizFixture;
      await mark(cast.student.client, text.id, { completed: true });
      await mark(cast.student.client, video.id, { completed: true });
      await settle();
      expect(courseEvents).toEqual([]);

      await cast.student.client.post(`/api/v1/quizzes/${quiz.id}/attempts`, {
        answers: { [questionIds[0]!]: correct[0], [questionIds[1]!]: correct[1] },
      });
      await settle();
      expect(courseEvents).toEqual([{ userId: cast.student.userId, courseId: course.id }]);

      // completing the same lesson again does not announce the course again
      await mark(cast.student.client, video.id, { completed: true });
      await settle();
      expect(courseEvents).toHaveLength(1);
    });

    it('announces nothing when the write is refused', async () => {
      const { cast, quiz } = await setup();
      await mark(cast.student.client, quiz.id, { completed: true });
      await mark(cast.otherStudent.client, quiz.id, { completed: true });
      await settle();
      expect(lessonEvents).toEqual([]);
    });
  });
});
