import { randomUUID } from 'node:crypto';
import { uploadedBannerPath, uploadedCoverPath } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { courses } from '../src/db/schema';
import { bannerFileKey } from '../src/modules/courses/banner';
import { coverFileKey } from '../src/modules/courses/cover';
import { removeStaleCourseImages } from '../src/modules/courses/images';
import { createCast, insertCourse } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('abandoned cover and banner uploads', () => {
  let ctx: TestApp;
  const log = { warn: () => undefined };
  const inTwoDays = () => new Date(Date.now() + 48 * 3600_000);

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDatabase(ctx.app);
  });

  const put = (key: string) => ctx.app.storage.putText(key, 'image', 'image/png');

  it('deletes uploads no course points at, and keeps the current cover and banner', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const [current, abandonedCover, abandonedBanner, currentBanner] = Array.from(
      { length: 4 },
      () => randomUUID(),
    );
    await put(coverFileKey(course.id, current!));
    await put(coverFileKey(course.id, abandonedCover!));
    await put(bannerFileKey(course.id, currentBanner!));
    await put(bannerFileKey(course.id, abandonedBanner!));
    await ctx.app.db
      .update(courses)
      .set({
        coverImageUrl: uploadedCoverPath(course.id, current!),
        bannerImageUrl: uploadedBannerPath(course.id, currentBanner!),
      })
      .where(eq(courses.id, course.id));

    await removeStaleCourseImages(ctx.app.db, ctx.app.storage, log, inTwoDays());

    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, current!))).not.toBeNull();
    expect(await ctx.app.storage.sizeOf(bannerFileKey(course.id, currentBanner!))).not.toBeNull();
    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, abandonedCover!))).toBeNull();
    expect(await ctx.app.storage.sizeOf(bannerFileKey(course.id, abandonedBanner!))).toBeNull();
  });

  it('leaves a fresh upload alone: its owner may still be about to confirm it', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const coverId = randomUUID();
    await put(coverFileKey(course.id, coverId));

    await removeStaleCourseImages(ctx.app.db, ctx.app.storage, log, new Date());

    expect(await ctx.app.storage.sizeOf(coverFileKey(course.id, coverId))).not.toBeNull();
  });
});
