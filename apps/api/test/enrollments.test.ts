import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createCast,
  insertCourse,
  insertGrant,
  insertLesson,
  insertModule,
  insertProgress,
} from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

describe('my courses and continue learning', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  /** A published course with `count` lessons: the first ones are text, the last is a video. */
  async function courseWith(
    instructorId: string,
    title: string,
    options: {
      count?: number;
      status?: 'published' | 'archived' | 'draft';
      sequential?: boolean;
    } = {},
  ) {
    const course = await insertCourse(ctx.app, {
      instructorId,
      title,
      status: options.status ?? 'published',
      sequentialOrder: options.sequential ?? false,
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const count = options.count ?? 2;
    const lessons = [];
    for (let index = 0; index < count; index += 1) {
      lessons.push(
        await insertLesson(ctx.app, courseModule.id, index, {
          title: `${title} ${index + 1}`,
          type: index === count - 1 ? 'video' : 'text',
          durationSeconds: 100,
        }),
      );
    }
    return { course, courseModule, lessons };
  }

  describe('GET /me/courses', () => {
    it('lists courses with an active grant, with progress, most recent first', async () => {
      const cast = await createCast(ctx.app);
      const teacher = cast.instructorA.userId;
      const a = await courseWith(teacher, 'Alpha', { count: 2 });
      const b = await courseWith(teacher, 'Beta', { count: 4 });
      const archived = await courseWith(teacher, 'Archived', { status: 'archived' });
      const draft = await courseWith(teacher, 'Draft', { status: 'draft' });
      const ungranted = await courseWith(teacher, 'Ungranted');
      const revoked = await courseWith(teacher, 'Revoked');
      const expired = await courseWith(teacher, 'Expired');

      const grant = (courseId: string, extra: { revokedAt?: Date; expiresAt?: Date } = {}) =>
        insertGrant(ctx.app, {
          userId: cast.student.userId,
          courseId,
          createdById: teacher,
          ...extra,
        });
      const grantA = await grant(a.course.id);
      await grant(b.course.id);
      await grant(archived.course.id);
      await grant(draft.course.id);
      await grant(revoked.course.id, { revokedAt: new Date() });
      await grant(expired.course.id, { expiresAt: new Date(Date.now() - 86_400_000) });
      void ungranted;

      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: a.lessons[0]!.id,
        updatedAt: new Date('2026-03-02T10:00:00Z'),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: b.lessons[0]!.id,
        updatedAt: new Date('2026-03-05T10:00:00Z'),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: b.lessons[1]!.id,
        completed: false,
        updatedAt: new Date('2026-03-06T10:00:00Z'),
      });
      // somebody else's work in the same course never shows up in this student's numbers
      await insertProgress(ctx.app, {
        userId: cast.otherStudent.userId,
        lessonId: b.lessons[2]!.id,
        updatedAt: new Date('2026-03-09T10:00:00Z'),
      });

      const response = await cast.student.client.get('/api/v1/me/courses');
      expect(response.statusCode).toBe(200);
      const items = response.json().courses as Array<{
        course: { id: string; modules?: unknown; lessonCount: number };
        grant: { id: string; status: string };
        progress: {
          completedCount: number;
          totalCount: number;
          percent: number;
          isComplete: boolean;
          nextLessonId: string | null;
        };
        lastActivityAt: string | null;
      }>;

      // sorted by the latest of last activity and grant date: the grant of Archived is the newest
      // event (just now), then Beta (even an unfinished lesson counts as activity), then Alpha
      expect(items.map((item) => item.course.id)).toEqual([
        archived.course.id,
        b.course.id,
        a.course.id,
      ]);
      expect(items[1]!.progress).toEqual({
        completedCount: 1,
        totalCount: 4,
        percent: 0.25,
        isComplete: false,
        nextLessonId: b.lessons[1]!.id,
      });
      expect(items[1]!.lastActivityAt).toBe('2026-03-06T10:00:00.000Z');
      expect(items[2]!.grant).toMatchObject({ id: grantA.id, status: 'active' });
      expect(items[2]!.course.lessonCount).toBe(2);
      expect(items[0]!.lastActivityAt).toBeNull();
      // summaries only: the curriculum stays out
      for (const item of items) expect(item.course).not.toHaveProperty('modules');
    });

    it('is empty for people without grants and needs a session', async () => {
      const cast = await createCast(ctx.app);
      const { course } = await courseWith(cast.instructorA.userId, 'Alpha');
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      expect((await cast.otherStudent.client.get('/api/v1/me/courses')).json()).toEqual({
        courses: [],
      });
      expect((await new TestClient(ctx.app).get('/api/v1/me/courses')).statusCode).toBe(401);
    });

    it('stops calling a course complete once a lesson is added', async () => {
      const cast = await createCast(ctx.app);
      const { course, courseModule, lessons } = await courseWith(cast.instructorA.userId, 'Alpha');
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      for (const lesson of lessons) {
        await insertProgress(ctx.app, { userId: cast.student.userId, lessonId: lesson.id });
      }
      const complete = await cast.student.client.get('/api/v1/me/courses');
      expect(complete.json().courses[0].progress).toMatchObject({ isComplete: true, percent: 1 });

      await insertLesson(ctx.app, courseModule.id, 2, { title: 'Late addition' });
      const after = await cast.student.client.get('/api/v1/me/courses');
      expect(after.json().courses[0].progress).toMatchObject({
        isComplete: false,
        completedCount: 2,
        totalCount: 3,
      });
    });
  });

  describe('GET /me/continue-learning', () => {
    it('is null before any activity and after everything is done', async () => {
      const cast = await createCast(ctx.app);
      const { course, lessons } = await courseWith(cast.instructorA.userId, 'Alpha');
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      const empty = await cast.student.client.get('/api/v1/me/continue-learning');
      expect(empty.json()).toEqual({ item: null });

      for (const lesson of lessons) {
        await insertProgress(ctx.app, { userId: cast.student.userId, lessonId: lesson.id });
      }
      const done = await cast.student.client.get('/api/v1/me/continue-learning');
      expect(done.json()).toEqual({ item: null });
    });

    it('points to the next lesson of the course with the latest activity, with the saved position', async () => {
      const cast = await createCast(ctx.app);
      const teacher = cast.instructorA.userId;
      const a = await courseWith(teacher, 'Alpha', { count: 3 });
      const b = await courseWith(teacher, 'Beta', { count: 2 });
      for (const { course } of [a, b]) {
        await insertGrant(ctx.app, {
          userId: cast.student.userId,
          courseId: course.id,
          createdById: teacher,
        });
      }
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: a.lessons[0]!.id,
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: b.lessons[0]!.id,
        updatedAt: new Date('2026-03-04T10:00:00Z'),
      });
      // the video of Beta: not completed, watched up to 42s, the most recent activity of all
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: b.lessons[1]!.id,
        completed: false,
        videoPositionSeconds: 42,
        updatedAt: new Date('2026-03-05T10:00:00Z'),
      });

      const response = await cast.student.client.get('/api/v1/me/continue-learning');
      const { item } = response.json();
      expect(item.course.id).toBe(b.course.id);
      expect(item.lesson).toEqual({
        id: b.lessons[1]!.id,
        type: 'video',
        durationSeconds: 100,
        translations: [{ locale: 'en', title: 'Beta 2' }],
      });
      expect(item.videoPositionSeconds).toBe(42);
      expect(item.progress).toMatchObject({ completedCount: 1, totalCount: 2 });
    });

    it('skips a finished course and one whose grant was revoked', async () => {
      const cast = await createCast(ctx.app);
      const teacher = cast.instructorA.userId;
      const finished = await courseWith(teacher, 'Finished', { count: 1 });
      const revoked = await courseWith(teacher, 'Revoked', { count: 2 });
      const open = await courseWith(teacher, 'Open', { count: 2 });
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: finished.course.id,
        createdById: teacher,
      });
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: revoked.course.id,
        createdById: teacher,
        revokedAt: new Date(),
      });
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: open.course.id,
        createdById: teacher,
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: open.lessons[0]!.id,
        updatedAt: new Date('2026-03-01T10:00:00Z'),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: revoked.lessons[0]!.id,
        updatedAt: new Date('2026-03-08T10:00:00Z'),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: finished.lessons[0]!.id,
        updatedAt: new Date('2026-03-09T10:00:00Z'),
      });

      const { item } = (await cast.student.client.get('/api/v1/me/continue-learning')).json();
      expect(item.course.id).toBe(open.course.id);
    });
  });

  describe('GET /courses/:id/students', () => {
    async function scenario() {
      const cast = await createCast(ctx.app);
      const { course, lessons } = await courseWith(cast.instructorA.userId, 'Alpha', { count: 2 });
      const grant = await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
      });
      await insertGrant(ctx.app, {
        userId: cast.otherStudent.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
        revokedAt: new Date(),
      });
      await insertProgress(ctx.app, {
        userId: cast.student.userId,
        lessonId: lessons[0]!.id,
        updatedAt: new Date('2026-03-02T10:00:00Z'),
      });
      return { cast, course, grant };
    }

    it('lists the grantees with their progress to the course managers', async () => {
      const { cast, course, grant } = await scenario();
      for (const who of [cast.instructorA, cast.admin]) {
        const response = await who.client.get(`/api/v1/courses/${course.id}/students`);
        expect(response.statusCode).toBe(200);
        const students = response.json().students as Array<{
          user: { id: string; name: string; email: string };
          grant: { id: string; status: string };
          progress: { completedCount: number; totalCount: number };
          lastActivityAt: string | null;
        }>;
        expect(students).toHaveLength(2);
        const sam = students.find((item) => item.user.id === cast.student.userId)!;
        expect(sam).toMatchObject({
          user: { name: 'Sam Student', email: 'sam@example.com' },
          grant: { id: grant.id, status: 'active' },
          progress: { completedCount: 1, totalCount: 2 },
          lastActivityAt: '2026-03-02T10:00:00.000Z',
        });
        const olga = students.find((item) => item.user.id === cast.otherStudent.userId)!;
        expect(olga.grant.status).toBe('revoked');
        expect(olga.progress.completedCount).toBe(0);
        expect(olga.lastActivityAt).toBeNull();
      }
    });

    it('shows one entry per student, preferring the open grant over old revoked ones', async () => {
      const { cast, course, grant } = await scenario();
      await insertGrant(ctx.app, {
        userId: cast.student.userId,
        courseId: course.id,
        createdById: cast.instructorA.userId,
        revokedAt: new Date('2026-01-01T00:00:00Z'),
      });
      const students = (
        await cast.instructorA.client.get(`/api/v1/courses/${course.id}/students`)
      ).json().students as Array<{ user: { id: string }; grant: { id: string } }>;
      const sam = students.filter((item) => item.user.id === cast.student.userId);
      expect(sam).toHaveLength(1);
      expect(sam[0]!.grant.id).toBe(grant.id);
    });

    it('refuses everyone who cannot manage the course', async () => {
      const { cast, course } = await scenario();
      const url = `/api/v1/courses/${course.id}/students`;
      expect((await cast.student.client.get(url)).statusCode).toBe(403);
      expect((await cast.instructorB.client.get(url)).statusCode).toBe(403);
      expect((await new TestClient(ctx.app).get(url)).statusCode).toBe(401);
    });

    it('answers 404 for unknown courses and for drafts the caller cannot see', async () => {
      const cast = await createCast(ctx.app);
      const draft = await courseWith(cast.instructorA.userId, 'Draft', { status: 'draft' });
      const unknown = await cast.instructorB.client.get(
        '/api/v1/courses/00000000-0000-4000-8000-000000000000/students',
      );
      const hidden = await cast.instructorB.client.get(
        `/api/v1/courses/${draft.course.id}/students`,
      );
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual(unknown.json());
    });
  });
});
