import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createVideoUploadResponseSchema,
  videoPlaybackResponseSchema,
  videoStatusResponseSchema,
  type CreateVideoUploadResponse,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { grants, lessons, outboxEvents, videoAssets } from '../src/db/schema';
import { processVideo } from '../src/modules/video/process';
import { removeStaleUploads } from '../src/modules/video/service';
import type { Storage } from '../src/storage/s3';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import {
  createTestApp,
  resetDatabase,
  startTestWorker,
  type TestApp,
  type TestWorker,
} from './helpers';

const run = promisify(execFile);

describe('video upload, processing and playback', () => {
  const queuePrefix = `opencourse:test-queue:${randomUUID()}`;
  let ctx: TestApp;
  let worker: TestWorker;
  let workDir: string;
  let clip: Buffer;

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'opencourse-video-test-'));
    const clipPath = path.join(workDir, 'clip.mp4');
    // a few seconds of test pattern and tone, small enough to encode in a moment
    await run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=3:size=640x360:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      clipPath,
    ]);
    clip = await readFile(clipPath);
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

  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Video lesson',
      type: 'video',
    });
    return { cast, course, courseModule, lesson };
  }

  /** What the web app does: ask for addresses, PUT each slice, report the ETags. */
  async function sendFile(
    client: { post(url: string, body?: unknown): Promise<{ statusCode: number; json(): unknown }> },
    lessonId: string,
    file: Buffer,
    contentType = 'video/mp4',
  ) {
    const started = await client.post(`/api/v1/lessons/${lessonId}/video/upload`, {
      filename: 'clip.mp4',
      contentType,
      sizeBytes: file.length,
    });
    expect(started.statusCode).toBe(200);
    const upload: CreateVideoUploadResponse = createVideoUploadResponseSchema.parse(started.json());
    const parts = [];
    for (const part of upload.parts) {
      const start = (part.partNumber - 1) * upload.partSizeBytes;
      const response = await fetch(part.url, {
        method: 'PUT',
        body: file.subarray(start, start + upload.partSizeBytes),
      });
      expect(response.status).toBe(200);
      parts.push({ partNumber: part.partNumber, etag: response.headers.get('etag')! });
    }
    const completed = await client.post(`/api/v1/lessons/${lessonId}/video/complete`, { parts });
    return { upload, completed };
  }

  it('encodes an uploaded file to HLS, announces it and serves it to a student with a grant', async () => {
    const { cast, course, lesson } = await setup();
    const { upload, completed } = await sendFile(cast.instructorA.client, lesson.id, clip);
    expect(completed.statusCode).toBe(200);
    expect(videoStatusResponseSchema.parse(completed.json()).video.status).toBe('processing');
    await worker.drain(60_000);

    const status = await cast.instructorA.client.get(`/api/v1/videos/${upload.assetId}/status`);
    const video = videoStatusResponseSchema.parse(status.json()).video;
    expect(video).toMatchObject({ status: 'ready', provider: 'local', errorMessage: null });
    expect(video.durationSeconds).toBeGreaterThanOrEqual(2);

    const [event] = await ctx.app.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.name, 'video.processed'));
    expect(event?.payload).toMatchObject({ assetId: upload.assetId, lessonId: lesson.id });

    // a student without a grant cannot stream it; with one they can
    expect(
      (await cast.student.client.get(`/api/v1/videos/${upload.assetId}/playback`)).statusCode,
    ).toBe(403);
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.admin.userId,
    });

    // the lesson now shows the video and takes its duration
    const detail = await cast.student.client.get(`/api/v1/courses/${course.id}`);
    const lessonJson = detail.json().course.modules[0].lessons[0];
    expect(lessonJson.video).toMatchObject({ provider: 'local', status: 'ready' });
    expect(lessonJson.durationSeconds).toBe(video.durationSeconds);

    const playback = await cast.student.client.get(`/api/v1/videos/${upload.assetId}/playback`);
    expect(playback.statusCode).toBe(200);
    const { playbackUrl } = videoPlaybackResponseSchema.parse(playback.json());

    const master = await ctx.app.inject({ method: 'GET', url: playbackUrl });
    expect(master.statusCode).toBe(200);
    expect(master.headers['content-type']).toContain('application/vnd.apple.mpegurl');
    const variant = master.body.split('\n').find((line) => line.startsWith('/api/v1/videos/'))!;
    expect(variant).toContain('/360p.m3u8?token=');

    const rendition = await ctx.app.inject({ method: 'GET', url: variant });
    expect(rendition.statusCode).toBe(200);
    const segmentUrl = rendition.body.split('\n').find((line) => line.startsWith('http'))!;
    const segment = await fetch(segmentUrl);
    expect(segment.status).toBe(200);
    expect(segment.headers.get('content-type')).toBe('video/mp2t');
    expect((await segment.arrayBuffer()).byteLength).toBeGreaterThan(1000);

    // the source file is gone once the renditions exist
    expect(await ctx.app.storage.sizeOf(`videos/${upload.assetId}/source`)).toBeNull();

    // access is checked again on every playlist request
    await ctx.app.db.update(grants).set({ revokedAt: new Date() });
    expect((await ctx.app.inject({ method: 'GET', url: variant })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'GET', url: playbackUrl })).statusCode).toBe(403);
  }, 90_000);

  it('refuses playlists without a valid token, or with the token of another video', async () => {
    const { cast, lesson } = await setup();
    const { upload } = await sendFile(cast.instructorA.client, lesson.id, clip);
    await worker.drain(60_000);
    const url = (token: string) => `/api/v1/videos/${upload.assetId}/master.m3u8?token=${token}`;
    expect((await ctx.app.inject({ method: 'GET', url: url('nope') })).statusCode).toBe(401);
    const other = `/api/v1/videos/${randomUUID()}/master.m3u8?token=nope`;
    expect((await ctx.app.inject({ method: 'GET', url: other })).statusCode).toBe(401);
    expect(
      (await ctx.app.inject({ method: 'GET', url: `/api/v1/videos/${upload.assetId}/master.m3u8` }))
        .statusCode,
    ).toBe(400);
  }, 90_000);

  it('marks a file that is not a video as failed, with a message, without retrying', async () => {
    const { cast, lesson } = await setup();
    const { upload } = await sendFile(
      cast.instructorA.client,
      lesson.id,
      Buffer.from('this is not a video'),
    );
    await worker.drain(30_000);
    const status = await cast.instructorA.client.get(`/api/v1/videos/${upload.assetId}/status`);
    expect(videoStatusResponseSchema.parse(status.json()).video).toMatchObject({
      status: 'error',
      errorMessage: expect.stringContaining('video'),
    });
    expect(
      (await cast.student.client.get(`/api/v1/videos/${upload.assetId}/playback`)).statusCode,
    ).toBe(403);
  }, 60_000);

  it('validates the upload request and the order of the calls', async () => {
    const { cast, lesson, courseModule } = await setup();
    const instructor = cast.instructorA.client;
    const upload = `/api/v1/lessons/${lesson.id}/video/upload`;
    const sizeBytes = 1000;
    expect(
      (
        await instructor.post(upload, {
          filename: 'a.pdf',
          contentType: 'application/pdf',
          sizeBytes,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await instructor.post(upload, {
          filename: 'a.mp4',
          contentType: 'video/mp4',
          sizeBytes: ctx.config.VIDEO_MAX_UPLOAD_BYTES + 1,
        })
      ).statusCode,
    ).toBe(400);
    // completing without an upload in progress
    expect(
      (
        await instructor.post(`/api/v1/lessons/${lesson.id}/video/complete`, {
          parts: [{ partNumber: 1, etag: 'x' }],
        })
      ).statusCode,
    ).toBe(409);
    // only the course's instructor, and only on video lessons
    const body = { filename: 'a.mp4', contentType: 'video/mp4', sizeBytes };
    expect((await cast.instructorB.client.post(upload, body)).statusCode).toBe(403);
    expect((await cast.student.client.post(upload, body)).statusCode).toBe(403);
    const text = await insertLesson(ctx.app, courseModule.id, 1, { title: 'Text', type: 'text' });
    expect(
      (await instructor.post(`/api/v1/lessons/${text.id}/video/upload`, body)).statusCode,
    ).toBe(400);
  });

  it('rejects an upload whose size differs from the announced one', async () => {
    const { cast, lesson } = await setup();
    const started = await cast.instructorA.client.post(
      `/api/v1/lessons/${lesson.id}/video/upload`,
      {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        sizeBytes: clip.length + 10,
      },
    );
    const upload = createVideoUploadResponseSchema.parse(started.json());
    const response = await fetch(upload.parts[0]!.url, { method: 'PUT', body: clip });
    const completed = await cast.instructorA.client.post(
      `/api/v1/lessons/${lesson.id}/video/complete`,
      { parts: [{ partNumber: 1, etag: response.headers.get('etag')! }] },
    );
    expect(completed.statusCode).toBe(400);
    const [asset] = await ctx.app.db.select().from(videoAssets);
    expect(asset?.status).toBe('error');
  });

  it('replaces an uploaded video with a pasted link and deletes its files', async () => {
    const { cast, lesson } = await setup();
    const { upload } = await sendFile(cast.instructorA.client, lesson.id, clip);
    await worker.drain(60_000);
    const playlistKey = `videos/${upload.assetId}/hls/master.m3u8`;
    expect(await ctx.app.storage.sizeOf(playlistKey)).not.toBeNull();

    const bad = await cast.instructorA.client.patch(`/api/v1/lessons/${lesson.id}`, {
      video: { url: 'https://example.com/page' },
    });
    expect(bad.statusCode).toBe(400);
    expect(await ctx.app.db.select().from(videoAssets)).toHaveLength(1);

    const replaced = await cast.instructorA.client.patch(`/api/v1/lessons/${lesson.id}`, {
      video: { url: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    expect(replaced.statusCode).toBe(200);
    expect(replaced.json().course.modules[0].lessons[0].video).toMatchObject({
      provider: 'external',
      plugin: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    expect(await ctx.app.db.select().from(videoAssets)).toHaveLength(0);
    expect(await ctx.app.storage.sizeOf(playlistKey)).toBeNull();
  }, 90_000);

  it('deletes the files of a lesson that is deleted', async () => {
    const { cast, lesson, courseModule } = await setup();
    // a published course must keep at least one lesson
    await insertLesson(ctx.app, courseModule.id, 1, { title: 'Other', type: 'text' });
    const { upload } = await sendFile(cast.instructorA.client, lesson.id, clip);
    await worker.drain(60_000);
    const response = await cast.instructorA.client.delete(`/api/v1/lessons/${lesson.id}`);
    expect(response.statusCode).toBe(200);
    expect(await ctx.app.storage.sizeOf(`videos/${upload.assetId}/hls/master.m3u8`)).toBeNull();
  }, 90_000);

  it('drops uploads that were never completed after a day', async () => {
    const { cast, lesson } = await setup();
    await cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/video/upload`, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: clip.length,
    });
    const log = { warn: () => undefined };
    const inOneHour = new Date(Date.now() + 3600_000);
    expect(await removeStaleUploads(ctx.app.db, ctx.app.storage, log, inOneHour)).toBe(0);
    const inTwoDays = new Date(Date.now() + 48 * 3600_000);
    expect(await removeStaleUploads(ctx.app.db, ctx.app.storage, log, inTwoDays)).toBe(1);
    expect(await ctx.app.db.select().from(videoAssets)).toHaveLength(0);
  });

  const videoProcessedEvents = () =>
    ctx.app.db.select().from(outboxEvents).where(eq(outboxEvents.name, 'video.processed'));

  /** An asset waiting to be encoded, with its source file already in the storage. */
  async function insertProcessingAsset(lessonId: string) {
    const assetId = randomUUID();
    await ctx.app.storage.uploadFile(
      `videos/${assetId}/source`,
      path.join(workDir, 'clip.mp4'),
      'video/mp4',
    );
    await ctx.app.db
      .insert(videoAssets)
      .values({ id: assetId, lessonId, sizeBytes: clip.length, status: 'processing' });
    return assetId;
  }

  it('does not announce or keep the files of a video replaced while it was encoding', async () => {
    const { lesson } = await setup();
    const assetId = await insertProcessingAsset(lesson.id);
    const replacedMidway: Storage = {
      ...ctx.app.storage,
      async downloadToFile(key, filePath) {
        // the instructor swaps the video right after the worker took the file
        await ctx.app.db.delete(videoAssets).where(eq(videoAssets.id, assetId));
        await ctx.app.storage.downloadToFile(key, filePath);
      },
    };

    await processVideo(ctx.app.db, replacedMidway, assetId, true, { warn: () => undefined });

    expect(await videoProcessedEvents()).toHaveLength(0);
    const [row] = await ctx.app.db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(row?.durationSeconds).toBe(60);
    expect(await ctx.app.storage.sizeOf(`videos/${assetId}/hls/master.m3u8`)).toBeNull();
    expect(await ctx.app.storage.sizeOf(`videos/${assetId}/source`)).toBeNull();
  }, 60_000);

  it('keeps a finished video ready when deleting its source fails afterwards', async () => {
    const { lesson } = await setup();
    const assetId = await insertProcessingAsset(lesson.id);
    const warnings: unknown[] = [];
    const flaky: Storage = {
      ...ctx.app.storage,
      async deletePrefix(prefix) {
        if (prefix.endsWith('/source')) throw new Error('storage hiccup');
        await ctx.app.storage.deletePrefix(prefix);
      },
    };

    // the last attempt: a wrongly treated cleanup error would turn the video into `error`
    await processVideo(ctx.app.db, flaky, assetId, true, {
      warn: (...args: unknown[]) => warnings.push(args),
    });

    const [asset] = await ctx.app.db.select().from(videoAssets).where(eq(videoAssets.id, assetId));
    expect(asset).toMatchObject({ status: 'ready', errorMessage: null });
    expect(warnings).toHaveLength(1);
    expect(await videoProcessedEvents()).toHaveLength(1);
    await ctx.app.storage.deletePrefix(`videos/${assetId}/`);
  }, 60_000);

  it('refuses an upload that would take the ready video of a published course', async () => {
    const { cast, lesson } = await setup();
    const [ready] = await ctx.app.db
      .insert(videoAssets)
      .values({
        lessonId: lesson.id,
        sizeBytes: 10,
        status: 'ready',
        durationSeconds: 3,
        renditions: ['360p'],
      })
      .returning();

    const response = await cast.instructorA.client.post(
      `/api/v1/lessons/${lesson.id}/video/upload`,
      {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        sizeBytes: 1000,
      },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.issues).toContain('videoNotReady');
    // nothing changed: the same ready video is still there
    const rows = await ctx.app.db.select().from(videoAssets);
    expect(rows.map((row) => [row.id, row.status])).toEqual([[ready!.id, 'ready']]);
  });

  it('queues two uploads started together for one lesson instead of failing one', async () => {
    const { cast, lesson } = await setup();
    const start = () =>
      cast.instructorA.client.post(`/api/v1/lessons/${lesson.id}/video/upload`, {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        sizeBytes: clip.length,
      });

    const [first, second] = await Promise.all([start(), start()]);

    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    // only the last request keeps its asset; the other one was replaced
    expect(await ctx.app.db.select().from(videoAssets)).toHaveLength(1);
  });

  it('reads lessons saved before provider plugins, and drops what no plugin recognises', async () => {
    const { cast, course, courseModule, lesson } = await setup();
    const other = await insertLesson(ctx.app, courseModule.id, 1, {
      title: 'Other',
      type: 'video',
    });
    const unknown = await insertLesson(ctx.app, courseModule.id, 2, {
      title: 'Unknown',
      type: 'video',
    });
    const legacy = (url: string) =>
      ({ provider: 'external', externalId: url, status: 'ready', playbackUrl: url }) as never;
    await ctx.app.db
      .update(lessons)
      .set({ video: legacy('https://youtu.be/dQw4w9WgXcQ') })
      .where(eq(lessons.id, lesson.id));
    await ctx.app.db
      .update(lessons)
      .set({ video: legacy('https://example.com/clip.mp4') })
      .where(eq(lessons.id, other.id));
    await ctx.app.db
      .update(lessons)
      .set({ video: legacy('https://example.com/page') })
      .where(eq(lessons.id, unknown.id));

    const response = await cast.instructorA.client.get(`/api/v1/courses/${course.id}`);

    expect(response.statusCode).toBe(200);
    const [first, second, third] = response.json().course.modules[0].lessons;
    expect(first.video).toMatchObject({
      provider: 'external',
      plugin: 'youtube',
      embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    });
    // a bare video file is now a provider of its own, so old direct links keep playing
    expect(second.video).toMatchObject({
      provider: 'external',
      plugin: 'direct',
      embedUrl: 'https://example.com/clip.mp4',
    });
    expect(third.video).toBeNull();
  });

  it('encodes a WebM whose container reports no duration, measuring it from the result', async () => {
    const { cast, lesson } = await setup();
    // written to a pipe, WebM cannot go back and store its length: the case of browser recordings
    const { stdout } = await run(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=3:size=320x240:rate=24',
        '-c:v',
        'libvpx',
        '-f',
        'webm',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
    );
    const { upload } = await sendFile(cast.instructorA.client, lesson.id, stdout, 'video/webm');
    await worker.drain(60_000);

    const status = await cast.instructorA.client.get(`/api/v1/videos/${upload.assetId}/status`);
    const video = videoStatusResponseSchema.parse(status.json()).video;
    expect(video.status).toBe('ready');
    expect(video.durationSeconds).toBeGreaterThanOrEqual(2);
    expect(video.durationSeconds).toBeLessThanOrEqual(4);
  }, 90_000);

  it('answers a repeated complete without breaking the video, and never with a 500', async () => {
    const { cast, lesson } = await setup();
    const client = cast.instructorA.client;
    const started = await client.post(`/api/v1/lessons/${lesson.id}/video/upload`, {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      sizeBytes: clip.length,
    });
    const upload = createVideoUploadResponseSchema.parse(started.json());
    const put = await fetch(upload.parts[0]!.url, { method: 'PUT', body: clip });
    const body = { parts: [{ partNumber: 1, etag: put.headers.get('etag')! }] };
    const complete = () => client.post(`/api/v1/lessons/${lesson.id}/video/complete`, body);

    // a double click: whichever call loses the claim gets a conflict, not a server error
    const together = await Promise.all([complete(), complete()]);
    expect(together.map((response) => response.statusCode).sort()).toSatisfy(
      (codes: number[]) =>
        codes.includes(200) && codes.every((code) => code === 200 || code === 409),
    );
    // asking again later (a timeout on the first answer) is harmless
    expect((await complete()).statusCode).toBe(200);

    await worker.drain(60_000);
    const [asset] = await ctx.app.db.select().from(videoAssets);
    expect(asset).toMatchObject({ id: upload.assetId, status: 'ready' });
  }, 90_000);

  it('aborts the unfinished upload of a video that is removed before it was completed', async () => {
    const { cast, lesson, courseModule } = await setup();
    // a published course keeps at least one lesson
    await insertLesson(ctx.app, courseModule.id, 1, { title: 'Other', type: 'text' });
    const started = await cast.instructorA.client.post(
      `/api/v1/lessons/${lesson.id}/video/upload`,
      {
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        sizeBytes: clip.length,
      },
    );
    const upload = createVideoUploadResponseSchema.parse(started.json());
    const [asset] = await ctx.app.db.select().from(videoAssets);
    const abort = vi.spyOn(ctx.app.storage, 'abortMultipartUpload');

    const response = await cast.instructorA.client.delete(`/api/v1/lessons/${lesson.id}`);

    expect(response.statusCode).toBe(200);
    expect(abort).toHaveBeenCalledWith(`videos/${upload.assetId}/source`, asset!.uploadId);
    abort.mockRestore();
  });

  it('encodes every rendition of a 720p source in one pass, each with its own segments', async () => {
    const { cast, lesson } = await setup();
    const clip720 = path.join(workDir, 'clip720.mp4');
    await run('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=1280x720:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      clip720,
    ]);
    const { upload } = await sendFile(cast.instructorA.client, lesson.id, await readFile(clip720));
    await worker.drain(60_000);

    const [asset] = await ctx.app.db.select().from(videoAssets);
    expect(asset).toMatchObject({
      id: upload.assetId,
      status: 'ready',
      renditions: ['360p', '720p'],
    });
    const master = await ctx.app.storage.readText(`videos/${upload.assetId}/hls/master.m3u8`);
    expect(master).toContain('RESOLUTION=640x360');
    expect(master).toContain('RESOLUTION=1280x720');
    for (const rendition of ['360p', '720p']) {
      const playlist = await ctx.app.storage.readText(
        `videos/${upload.assetId}/hls/${rendition}/index.m3u8`,
      );
      const segment = playlist.split('\n').find((line) => line.endsWith('.ts'))!;
      expect(
        await ctx.app.storage.sizeOf(`videos/${upload.assetId}/hls/${rendition}/${segment}`),
      ).toBeGreaterThan(1000);
    }
  }, 90_000);
});
