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

describe('studio metrics', () => {
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

  async function courseWith(
    instructorId: string,
    title: string,
    status: 'published' | 'draft' = 'published',
  ) {
    const course = await insertCourse(ctx.app, { instructorId, title, status });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lessons = [
      await insertLesson(ctx.app, courseModule.id, 0, { title: 'One' }),
      await insertLesson(ctx.app, courseModule.id, 1, { title: 'Two' }),
    ];
    return { course, lessons };
  }

  /**
   * Ines teaches Alpha (Sam finished it, Olga is half way, one grant revoked) and a draft; Ivo
   * teaches Beta (Sam started it, an expired grant).
   */
  async function scenario() {
    const cast = await createCast(ctx.app);
    const alpha = await courseWith(cast.instructorA.userId, 'Alpha');
    const draft = await courseWith(cast.instructorA.userId, 'Draft', 'draft');
    const beta = await courseWith(cast.instructorB.userId, 'Beta');
    const give = (userId: string, courseId: string, createdById: string, extra = {}) =>
      insertGrant(ctx.app, { userId, courseId, createdById, ...extra });

    await give(cast.student.userId, alpha.course.id, cast.instructorA.userId);
    await give(cast.otherStudent.userId, alpha.course.id, cast.instructorA.userId);
    await give(cast.instructorB.userId, alpha.course.id, cast.instructorA.userId, {
      revokedAt: new Date(),
    });
    await give(cast.student.userId, beta.course.id, cast.instructorB.userId);
    await give(cast.otherStudent.userId, beta.course.id, cast.instructorB.userId, {
      expiresAt: new Date(Date.now() - 86_400_000),
    });

    for (const lesson of alpha.lessons) {
      await insertProgress(ctx.app, { userId: cast.student.userId, lessonId: lesson.id });
    }
    await insertProgress(ctx.app, {
      userId: cast.otherStudent.userId,
      lessonId: alpha.lessons[0]!.id,
    });
    await insertProgress(ctx.app, { userId: cast.student.userId, lessonId: beta.lessons[0]!.id });
    // finished everything in Beta, but the grant expired: it must not count as completed
    for (const lesson of beta.lessons) {
      await insertProgress(ctx.app, { userId: cast.otherStudent.userId, lessonId: lesson.id });
    }
    return { cast, alpha, draft, beta };
  }

  it("counts the instructor's own courses: students with active access and completions", async () => {
    const { cast, alpha, draft } = await scenario();
    const response = await cast.instructorA.client.get('/api/v1/studio/metrics');
    expect(response.statusCode).toBe(200);
    const metrics = response.json();
    expect(metrics.activeStudents).toBe(2);
    expect(metrics.publishedCourses).toBe(1);
    expect(metrics.completionRate).toBe(0.5);
    expect(metrics.courses).toHaveLength(2);
    expect(metrics.courses).toContainEqual({
      courseId: alpha.course.id,
      students: 2,
      completedStudents: 1,
      completionRate: 0.5,
    });
    expect(metrics.courses).toContainEqual({
      courseId: draft.course.id,
      students: 0,
      completedStudents: 0,
      completionRate: 0,
    });
  });

  it('gives admins every course and counts a student once however many courses they follow', async () => {
    const { cast, beta } = await scenario();
    const metrics = (await cast.admin.client.get('/api/v1/studio/metrics')).json();
    expect(metrics.courses).toHaveLength(3);
    // Sam and Olga on Alpha, Sam on Beta (Olga's Beta grant expired)
    expect(metrics.activeStudents).toBe(2);
    expect(metrics.publishedCourses).toBe(2);
    // 1 completed enrollment over 3 active ones
    expect(metrics.completionRate).toBeCloseTo(1 / 3);
    expect(
      metrics.courses.find((c: { courseId: string }) => c.courseId === beta.course.id),
    ).toMatchObject({
      students: 1,
      completedStudents: 0,
    });
  });

  it('does not count deactivated users as students', async () => {
    const { cast, alpha } = await scenario();
    const deactivated = await cast.admin.client.patch(
      `/api/v1/admin/users/${cast.otherStudent.userId}/active`,
      { active: false },
    );
    expect(deactivated.statusCode).toBe(200);

    const metrics = (await cast.instructorA.client.get('/api/v1/studio/metrics')).json();
    expect(metrics.activeStudents).toBe(1);
    expect(
      metrics.courses.find((c: { courseId: string }) => c.courseId === alpha.course.id),
    ).toMatchObject({
      students: 1,
      completedStudents: 1,
      completionRate: 1,
    });
    expect(metrics.completionRate).toBe(1);
  });

  it('is all zeros for an instructor with nothing yet', async () => {
    const cast = await createCast(ctx.app);
    const metrics = (await cast.instructorB.client.get('/api/v1/studio/metrics')).json();
    expect(metrics).toEqual({
      activeStudents: 0,
      publishedCourses: 0,
      completionRate: 0,
      courses: [],
    });
  });

  it('is closed to students and signed-out visitors', async () => {
    const cast = await createCast(ctx.app);
    expect((await cast.student.client.get('/api/v1/studio/metrics')).statusCode).toBe(403);
    expect((await new TestClient(ctx.app).get('/api/v1/studio/metrics')).statusCode).toBe(401);
  });
});
