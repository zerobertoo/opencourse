import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { failedVideosResponseSchema, videoStatusResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { videoAssets } from '../src/db/schema';
import { createCast, insertCourse, insertLesson, insertModule } from './fixtures';
import {
  createTestApp,
  resetDatabase,
  startTestWorker,
  type TestApp,
  type TestWorker,
} from './helpers';

const run = promisify(execFile);
const FAILED_PATH = '/api/v1/admin/videos/failed';
const retryPath = (assetId: string) => `/api/v1/admin/videos/${assetId}/retry`;

describe('failed videos', () => {
  const queuePrefix = `opencourse:test-queue:${randomUUID()}`;
  let ctx: TestApp;
  let worker: TestWorker;
  let workDir: string;
  let clipPath: string;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'opencourse-failed-video-test-'));
    clipPath = path.join(workDir, 'clip.mp4');
    await run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=640x360:rate=24',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      clipPath,
    ]);
    ctx = await createTestApp({}, { queuePrefix });
    worker = await startTestWorker(ctx.mailer, { queuePrefix });
  }, 60_000);
  afterAll(async () => {
    await worker.dispose();
    await ctx.app.close();
    await rm(workDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  /** A video lesson whose asset failed, with or without its source file still stored. */
  async function setupFailedVideo({ keepSource = true } = {}) {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      title: 'Design basics',
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Colour theory',
      type: 'video',
    });
    const assetId = randomUUID();
    if (keepSource) {
      await ctx.app.storage.uploadFile(`videos/${assetId}/source`, clipPath, 'video/mp4');
    }
    await ctx.app.db.insert(videoAssets).values({
      id: assetId,
      lessonId: lesson.id,
      sizeBytes: 1000,
      status: 'error',
      errorMessage: 'The video could not be processed. Try uploading it again.',
    });
    return { cast, course, lesson, assetId };
  }

  it('lists the failed videos with their course and lesson, for admins only', async () => {
    const { cast, course, lesson, assetId } = await setupFailedVideo({ keepSource: false });

    const response = await cast.admin.client.get(FAILED_PATH);
    expect(response.statusCode).toBe(200);
    const { videos } = failedVideosResponseSchema.parse(response.json());
    expect(videos).toEqual([
      {
        assetId,
        lessonId: lesson.id,
        lessonTitle: 'Colour theory',
        courseId: course.id,
        courseTitle: 'Design basics',
        errorMessage: 'The video could not be processed. Try uploading it again.',
        failedAt: expect.any(String),
        sizeBytes: 1000,
      },
    ]);

    expect((await cast.instructorA.client.get(FAILED_PATH)).statusCode).toBe(403);
    expect((await cast.student.client.get(FAILED_PATH)).statusCode).toBe(403);
  });

  it('leaves out videos that are not in error', async () => {
    const { cast, assetId } = await setupFailedVideo({ keepSource: false });
    await ctx.app.db
      .update(videoAssets)
      .set({ status: 'ready', errorMessage: null })
      .where(eq(videoAssets.id, assetId));

    const response = await cast.admin.client.get(FAILED_PATH);
    expect(failedVideosResponseSchema.parse(response.json()).videos).toEqual([]);
  });

  it('sends a failed video back to the encoder and finishes it', async () => {
    const { cast, assetId } = await setupFailedVideo();

    const retried = await cast.admin.client.post(retryPath(assetId));
    expect(retried.statusCode).toBe(200);
    expect(videoStatusResponseSchema.parse(retried.json()).video).toMatchObject({
      assetId,
      status: 'processing',
      errorMessage: null,
    });
    await worker.drain(60_000);

    const [asset] = await ctx.app.db.select().from(videoAssets).where(eq(videoAssets.id, assetId));
    expect(asset).toMatchObject({ status: 'ready', errorMessage: null, poster: true });
    const listed = await cast.admin.client.get(FAILED_PATH);
    expect(failedVideosResponseSchema.parse(listed.json()).videos).toEqual([]);
  }, 90_000);

  it('answers 409 to a retry of a video that is not in error', async () => {
    const { cast, assetId } = await setupFailedVideo();
    expect((await cast.admin.client.post(retryPath(assetId))).statusCode).toBe(200);
    // already processing: a second click must not queue a second job
    expect((await cast.admin.client.post(retryPath(assetId))).statusCode).toBe(409);
    await worker.drain(60_000);
  }, 90_000);

  it('queues one job when two admins retry together', async () => {
    const { cast, assetId } = await setupFailedVideo();
    const statuses = (
      await Promise.all([
        cast.admin.client.post(retryPath(assetId)),
        cast.admin.client.post(retryPath(assetId)),
      ])
    )
      .map((response) => response.statusCode)
      .sort();
    expect(statuses).toEqual([200, 409]);
    await worker.drain(60_000);
  }, 90_000);

  it('refuses the retry, and keeps the failure, when the source file is gone', async () => {
    const { cast, assetId } = await setupFailedVideo({ keepSource: false });

    const response = await cast.admin.client.post(retryPath(assetId));
    expect(response.statusCode).toBe(409);
    const [asset] = await ctx.app.db.select().from(videoAssets).where(eq(videoAssets.id, assetId));
    expect(asset?.status).toBe('error');
  });

  it('answers 404 for an unknown video and 403 for who is not an admin', async () => {
    const { cast, assetId } = await setupFailedVideo();
    expect((await cast.admin.client.post(retryPath(randomUUID()))).statusCode).toBe(404);
    expect((await cast.instructorA.client.post(retryPath(assetId))).statusCode).toBe(403);
    await ctx.app.storage.deletePrefix(`videos/${assetId}/`);
  });
});
