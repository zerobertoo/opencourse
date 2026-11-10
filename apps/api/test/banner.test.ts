import { createBannerUploadResponseSchema, uploadedBannerPath } from '@opencourse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bannerFileKey } from '../src/modules/courses/banner';
import { createCast, insertCourse } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

const IMAGE = Buffer.from('not really a png, but the right size');

describe('course banners', () => {
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

  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'published',
    });
    return { cast, course };
  }

  async function sendBanner(client: TestClient, courseId: string, file = IMAGE) {
    const started = await client.post(`/api/v1/courses/${courseId}/banner`, {
      contentType: 'image/png',
      sizeBytes: file.length,
    });
    expect(started.statusCode).toBe(200);
    const { bannerId, uploadUrl } = createBannerUploadResponseSchema.parse(started.json());
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
    expect(put.status).toBe(200);
    const completed = await client.post(`/api/v1/courses/${courseId}/banner/complete`, {
      bannerId,
    });
    return { bannerId, completed };
  }

  it('uploads a banner, serves it to anyone, and replaces it by deleting the old file', async () => {
    const { cast, course } = await setup();

    const first = await sendBanner(cast.instructorA.client, course.id);
    expect(first.completed.statusCode).toBe(200);
    expect(first.completed.json().course.bannerImageUrl).toBe(
      uploadedBannerPath(course.id, first.bannerId),
    );
    // the cover is a separate field and stays as it was
    expect(first.completed.json().course.coverImageUrl).toBeNull();

    const read = await new TestClient(ctx.app).get(uploadedBannerPath(course.id, first.bannerId));
    expect(read.statusCode).toBe(302);
    const image = await fetch(read.headers.location as string);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(IMAGE);

    const second = await sendBanner(cast.instructorA.client, course.id);
    expect(await ctx.app.storage.sizeOf(bannerFileKey(course.id, first.bannerId))).toBeNull();
    expect(await ctx.app.storage.sizeOf(bannerFileKey(course.id, second.bannerId))).toBe(
      IMAGE.length,
    );
    const stale = await new TestClient(ctx.app).get(uploadedBannerPath(course.id, first.bannerId));
    expect(stale.statusCode).toBe(404);
  });

  it('removes the banner and its file', async () => {
    const { cast, course } = await setup();
    const uploaded = await sendBanner(cast.instructorA.client, course.id);

    const removed = await cast.instructorA.client.delete(`/api/v1/courses/${course.id}/banner`);
    expect(removed.json().course.bannerImageUrl).toBeNull();
    expect(await ctx.app.storage.sizeOf(bannerFileKey(course.id, uploaded.bannerId))).toBeNull();
  });

  it('refuses bad requests and unfinished uploads', async () => {
    const { cast, course } = await setup();
    const client = cast.instructorA.client;
    const url = `/api/v1/courses/${course.id}/banner`;

    expect(
      (await client.post(url, { contentType: 'image/svg+xml', sizeBytes: 10 })).statusCode,
    ).toBe(400);
    expect(
      (await client.post(url, { contentType: 'image/png', sizeBytes: 6 * 1024 ** 2 })).statusCode,
    ).toBe(400);
    const neverSent = await client.post(`${url}/complete`, {
      bannerId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
    });
    expect(neverSent.statusCode).toBe(400);
  });

  it('lets only the course instructor or an admin change the banner', async () => {
    const { cast, course } = await setup();
    const body = { contentType: 'image/png', sizeBytes: 10 };
    const url = `/api/v1/courses/${course.id}/banner`;

    expect((await cast.instructorB.client.post(url, body)).statusCode).toBe(403);
    expect((await cast.student.client.post(url, body)).statusCode).toBe(403);
    expect((await cast.admin.client.post(url, body)).statusCode).toBe(200);
    expect((await new TestClient(ctx.app).post(url, body)).statusCode).toBe(401);
  });
});
