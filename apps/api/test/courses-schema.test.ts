import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { courses, courseTranslations, grants, invites, lessons, modules } from '../src/db/schema';
import { isUniqueViolation } from '../src/errors';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('courses schema', () => {
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

  it('deletes translations, modules and lessons together with the course', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Basics');
    await insertLesson(ctx.app, courseModule.id, 0, { title: 'Hello' });

    await ctx.app.db.delete(courses).where(eq(courses.id, course.id));

    expect(await ctx.app.db.select().from(courseTranslations)).toHaveLength(0);
    expect(await ctx.app.db.select().from(modules)).toHaveLength(0);
    expect(await ctx.app.db.select().from(lessons)).toHaveLength(0);
  });

  it('allows one active grant per user and course, but a new one after revoking', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const base = {
      userId: cast.student.userId,
      courseId: course.id,
      createdById: cast.admin.userId,
    };

    const first = await insertGrant(ctx.app, base);
    const duplicate = await insertGrant(ctx.app, base).catch((error: unknown) => error);
    expect(isUniqueViolation(duplicate)).toBe(true);

    await ctx.app.db.update(grants).set({ revokedAt: new Date() }).where(eq(grants.id, first.id));
    await expect(insertGrant(ctx.app, base)).resolves.toBeDefined();
  });

  it('rejects an invite that points to a course that does not exist', async () => {
    const cast = await createCast(ctx.app);
    const attempt = ctx.app.db.insert(invites).values({
      email: 'x@example.com',
      courseId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11',
      tokenHash: 'hash',
      createdById: cast.admin.userId,
      expiresAt: new Date(Date.now() + 1000),
    });
    await expect(attempt).rejects.toThrow();
  });
});
