import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCast, insertCourseWithLesson, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('instructor in the course detail', () => {
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

  it('names who teaches the course to a granted student, by id and by slug', async () => {
    const cast = await createCast(ctx.app);
    const { course } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
    });
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    const expected = { id: cast.instructorA.userId, name: 'Ines Instructor' };

    const byId = await cast.student.client.get(`/api/v1/courses/${course.id}`);
    expect(byId.json().course.instructor).toEqual(expected);
    const bySlug = await cast.student.client.get(`/api/v1/courses/by-slug/${course.slug}`);
    expect(bySlug.json().course.instructor).toEqual(expected);
    const mine = await cast.instructorA.client.get(`/api/v1/courses/${course.id}`);
    expect(mine.json().course.instructor).toEqual(expected);
  });

  it('keeps the instructor in the curriculum write responses', async () => {
    const cast = await createCast(ctx.app);
    const { course } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
    });
    const response = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      sequentialOrder: true,
    });
    expect(response.json().course.instructor).toEqual({
      id: cast.instructorA.userId,
      name: 'Ines Instructor',
    });
  });
});
