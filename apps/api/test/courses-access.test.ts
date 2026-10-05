import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { users } from '../src/db/schema';
import { canManageCourse, resolveCourseAccess } from '../src/modules/courses/access';
import { createCast, insertCourse, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('canManageCourse', () => {
  const course = { instructorId: 'owner' };

  it('lets admins manage everything and instructors only their own courses', () => {
    expect(canManageCourse({ id: 'a', role: 'admin' }, course)).toBe(true);
    expect(canManageCourse({ id: 'owner', role: 'instructor' }, course)).toBe(true);
    expect(canManageCourse({ id: 'other', role: 'instructor' }, course)).toBe(false);
  });

  it('does not let an owner who lost the instructor role manage the course', () => {
    expect(canManageCourse({ id: 'owner', role: 'student' }, course)).toBe(false);
  });
});

describe('resolveCourseAccess', () => {
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

  async function userRow(id: string) {
    const [row] = await ctx.app.db.select().from(users).where(eq(users.id, id));
    if (!row) throw new Error('user missing');
    return row;
  }

  it('shows published courses to everyone but opens content only with an active grant', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const now = new Date();
    const student = await userRow(cast.student.userId);

    expect(await resolveCourseAccess(ctx.app.db, student, course, now)).toEqual({
      canManage: false,
      isVisible: true,
      canViewContent: false,
    });

    await insertGrant(ctx.app, {
      userId: student.id,
      courseId: course.id,
      createdById: cast.admin.userId,
    });
    expect((await resolveCourseAccess(ctx.app.db, student, course, now)).canViewContent).toBe(
      true,
    );
  });

  it('treats expired and revoked grants as no access', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const now = new Date();
    const createdById = cast.admin.userId;
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: course.id,
      createdById,
      expiresAt: new Date(now.getTime() - 1000),
    });
    await insertGrant(ctx.app, {
      userId: cast.otherStudent.userId,
      courseId: course.id,
      createdById,
      revokedAt: new Date(),
    });

    for (const id of [cast.student.userId, cast.otherStudent.userId]) {
      const access = await resolveCourseAccess(ctx.app.db, await userRow(id), course, now);
      expect(access).toMatchObject({ isVisible: true, canViewContent: false });
    }
  });

  it('hides drafts from non-managers and archived courses from people without a grant', async () => {
    const cast = await createCast(ctx.app);
    const draft = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const archived = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'archived',
    });
    const now = new Date();
    const student = await userRow(cast.student.userId);
    const owner = await userRow(cast.instructorA.userId);

    expect((await resolveCourseAccess(ctx.app.db, student, draft, now)).isVisible).toBe(false);
    expect((await resolveCourseAccess(ctx.app.db, student, archived, now)).isVisible).toBe(false);
    expect(await resolveCourseAccess(ctx.app.db, owner, draft, now)).toMatchObject({
      canManage: true,
      isVisible: true,
      canViewContent: true,
    });

    await insertGrant(ctx.app, {
      userId: student.id,
      courseId: archived.id,
      createdById: cast.admin.userId,
    });
    expect(await resolveCourseAccess(ctx.app.db, student, archived, now)).toMatchObject({
      isVisible: true,
      canViewContent: true,
    });
  });
});
