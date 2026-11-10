import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { videoAssets } from '../src/db/schema';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('video playback in a sequential course', () => {
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

  /** A sequential course whose second lesson has a ready video, and a student with a grant. */
  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      sequentialOrder: true,
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const first = await insertLesson(ctx.app, courseModule.id, 0, { title: 'One', type: 'text' });
    const second = await insertLesson(ctx.app, courseModule.id, 1, { title: 'Two', type: 'video' });
    const assetId = randomUUID();
    await ctx.app.db
      .insert(videoAssets)
      .values({ id: assetId, lessonId: second.id, sizeBytes: 1, status: 'ready' });
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.instructorA.userId,
    });
    return { cast, first, assetId };
  }

  it('keeps the video of a locked lesson closed until the previous lessons are completed', async () => {
    const { cast, first, assetId } = await setup();
    const playback = `/api/v1/videos/${assetId}/playback`;

    const locked = await cast.student.client.get(playback);
    expect(locked.statusCode).toBe(403);
    expect(locked.json().error.message).toBe('Complete the previous lessons first');

    await cast.student.client.put(`/api/v1/lessons/${first.id}/progress`, { completed: true });
    expect((await cast.student.client.get(playback)).statusCode).toBe(200);
  });

  it('lets the course staff play it without completing anything', async () => {
    const { cast, assetId } = await setup();
    const response = await cast.instructorA.client.get(`/api/v1/videos/${assetId}/playback`);
    expect(response.statusCode).toBe(200);
  });

  it('stops a playback address once the lesson is locked again', async () => {
    const { cast, first, assetId } = await setup();
    const progress = `/api/v1/lessons/${first.id}/progress`;
    await cast.student.client.put(progress, { completed: true });
    const { playbackUrl } = (
      await cast.student.client.get(`/api/v1/videos/${assetId}/playback`)
    ).json();

    await cast.student.client.put(progress, { completed: false });

    const reused = await ctx.app.inject({ method: 'GET', url: playbackUrl });
    expect(reused.statusCode).toBe(403);
  });
});
