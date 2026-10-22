import { createCoverUploadResponseSchema, uploadedCoverPath } from '@opencourse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { coverFileKey } from '../src/modules/courses/cover';
import { createCast, insertCourse } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

// a few bytes are enough: the API checks type and size, not pixels
const IMAGE = Buffer.from('not really a png, but the right size');

describe('course covers', () => {
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

  /** What the web app does: ask for an address, PUT the image, report it done. */
  async function sendCover(client: TestClient, courseId: string, file = IMAGE) {
    const started = await client.post(`/api/v1/courses/${courseId}/cover`, {
      contentType: 'image/png',
      sizeBytes: file.length,
    });
    expect(started.statusCode).toBe(200);
    const { coverId, uploadUrl } = createCoverUploadResponseSchema.parse(started.json());
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: file,
    });
    expect(put.status).toBe(200);
    const completed = await client.post(`/api/v1/courses/${courseId}/cover/complete`, { coverId });
    return { coverId, completed };
  }

  it('uploads a cover, serves it to anyone, and replaces it by deleting the old file', async () => {
    const { cast, course } = await setup();

    const first = await sendCover(cast.instructorA.client, course.id);
    expect(first.completed.statusCode).toBe(200);
    expect(first.completed.json().course.coverImageUrl).toBe(
      uploadedCoverPath(course.id, first.coverId),
    );

    // no session at all: an <img> cannot renew one
    const read = await new TestClient(ctx.app).get(uploadedCoverPath(course.id, first.coverId));
    expect(read.statusCode).toBe(302);
    const image = await fetch(read.headers.location as string);
    expect(Buffer.from(await image.arrayBuffer())).toEqual(IMAGE);

    const second = await sendCover(cast.instructorA.client, course.id);
    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, first.coverId))).toBeNull();
    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, second.coverId))).toBe(
      IMAGE.length,
    );
    // the replaced address is gone
    const stale = await new TestClient(ctx.app).get(uploadedCoverPath(course.id, first.coverId));
    expect(stale.statusCode).toBe(404);
  });

  it('removes the cover, and a link replaces an uploaded one', async () => {
    const { cast, course } = await setup();
    const uploaded = await sendCover(cast.instructorA.client, course.id);

    const removed = await cast.instructorA.client.delete(`/api/v1/courses/${course.id}/cover`);
    expect(removed.json().course.coverImageUrl).toBeNull();
    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, uploaded.coverId))).toBeNull();

    const again = await sendCover(cast.instructorA.client, course.id);
    const linked = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      coverImageUrl: 'https://example.com/cover.png',
    });
    expect(linked.json().course.coverImageUrl).toBe('https://example.com/cover.png');
    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, again.coverId))).toBeNull();
  });

  it('refuses bad requests and unfinished or foreign uploads', async () => {
    const { cast, course } = await setup();
    const client = cast.instructorA.client;
    const url = `/api/v1/courses/${course.id}/cover`;

    expect(
      (await client.post(url, { contentType: 'image/svg+xml', sizeBytes: 10 })).statusCode,
    ).toBe(400);
    expect(
      (await client.post(url, { contentType: 'image/png', sizeBytes: 6 * 1024 ** 2 })).statusCode,
    ).toBe(400);
    // completing something that was never sent
    const neverSent = await client.post(`${url}/complete`, {
      coverId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
    });
    expect(neverSent.statusCode).toBe(400);
  });

  it('lets only the course instructor or an admin change the cover', async () => {
    const { cast, course } = await setup();
    const body = { contentType: 'image/png', sizeBytes: 10 };

    expect(
      (await cast.instructorB.client.post(`/api/v1/courses/${course.id}/cover`, body)).statusCode,
    ).toBe(403);
    expect(
      (await cast.student.client.post(`/api/v1/courses/${course.id}/cover`, body)).statusCode,
    ).toBe(403);
    expect(
      (await cast.admin.client.post(`/api/v1/courses/${course.id}/cover`, body)).statusCode,
    ).toBe(200);
    expect(
      (await new TestClient(ctx.app).post(`/api/v1/courses/${course.id}/cover`, body)).statusCode,
    ).toBe(401);
  });
});
