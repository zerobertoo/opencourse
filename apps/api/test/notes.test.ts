import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createCast, insertCourseWithLesson, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

describe('lesson notes', () => {
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

  async function setup(status: 'published' | 'draft' = 'published') {
    const cast = await createCast(ctx.app);
    const { course, lesson } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status,
    });
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    return { cast, course, lesson, url: `/api/v1/lessons/${lesson.id}/note` };
  }

  it('has no note until one is written, then saves, replaces and erases it', async () => {
    const { cast, url, lesson } = await setup();
    expect((await cast.student.client.get(url)).json()).toEqual({ note: null });

    const saved = await cast.student.client.put(url, { content: 'first' });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().note).toMatchObject({
      userId: cast.student.userId,
      lessonId: lesson.id,
      content: 'first',
    });

    await cast.student.client.put(url, { content: 'second' });
    expect((await cast.student.client.get(url)).json().note.content).toBe('second');

    const erased = await cast.student.client.put(url, { content: '  \n ' });
    expect(erased.json()).toEqual({ note: null });
    expect((await cast.student.client.get(url)).json()).toEqual({ note: null });
  });

  it('is private to its author', async () => {
    const { cast, url, course } = await setup();
    await insertGrant(ctx.app, {
      userId: cast.otherStudent.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    await cast.student.client.put(url, { content: 'mine' });
    expect((await cast.otherStudent.client.get(url)).json()).toEqual({ note: null });
    // the instructor reads their own note, never the student's
    expect((await cast.instructorA.client.get(url)).json()).toEqual({ note: null });
  });

  it('needs access to the lesson', async () => {
    const { cast, url } = await setup();
    expect((await cast.otherStudent.client.get(url)).statusCode).toBe(403);
    expect((await cast.otherStudent.client.put(url, { content: 'x' })).statusCode).toBe(403);
    expect((await new TestClient(ctx.app).get(url)).statusCode).toBe(401);
  });

  it('answers the same 404 for unknown lessons and invisible drafts', async () => {
    const { cast, url } = await setup('draft');
    const unknown = await cast.student.client.get(`/api/v1/lessons/${UNKNOWN_ID}/note`);
    const hidden = await cast.student.client.get(url);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(unknown.json());
  });

  it('caps the size and rejects unknown fields', async () => {
    const { cast, url } = await setup();
    expect((await cast.student.client.put(url, { content: 'x'.repeat(20001) })).statusCode).toBe(
      400,
    );
    expect((await cast.student.client.put(url, { content: 'x', userId: 'y' })).statusCode).toBe(
      400,
    );
  });

  it('keeps the note through a revocation, hidden until access returns', async () => {
    const { cast, url, course } = await setup();
    await cast.student.client.put(url, { content: 'kept' });
    const [grantRow] = (
      await cast.instructorA.client.get(`/api/v1/grants?courseId=${course.id}`)
    ).json().grants;
    await cast.instructorA.client.post(`/api/v1/grants/${grantRow.id}/revoke`);
    expect((await cast.student.client.get(url)).statusCode).toBe(403);
    await cast.instructorA.client.post('/api/v1/grants', {
      userId: cast.student.userId,
      courseId: course.id,
      expiresAt: null,
    });
    expect((await cast.student.client.get(url)).json().note.content).toBe('kept');
  });
});
