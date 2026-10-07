import { courseResponseSchema, getPublishIssues } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { courses, grants, users } from '../src/db/schema';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, runSeedDemo, seedDemoData } from '../src/db/seed-demo';
import { loadCourseDetail } from '../src/modules/courses/detail';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

describe('demo seed', () => {
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

  async function signIn(email: string) {
    const client = new TestClient(ctx.app);
    const response = await client.post('/api/v1/auth/login', { email, password: DEMO_PASSWORD });
    expect(response.statusCode).toBe(200);
    return client;
  }

  it('creates the accounts, courses and grants, and the accounts can sign in', async () => {
    await seedDemoData(ctx.app.db);

    const accounts = await ctx.app.db.select().from(users);
    expect(accounts.map((account) => account.role).sort()).toEqual([
      'admin',
      'instructor',
      'student',
      'student',
    ]);
    expect(accounts.every((account) => account.email.endsWith('@opencourse.example'))).toBe(true);
    const rows = await ctx.app.db.select().from(courses);
    expect(rows.map((course) => course.status).sort()).toEqual(['draft', 'published', 'published']);
    expect(await ctx.app.db.select().from(grants)).toHaveLength(4);

    const student = await signIn('student@opencourse.example');
    const listed = (await student.get('/api/v1/courses')).json().courses as Array<{
      id: string;
      myGrant: { status: string } | null;
    }>;
    expect(listed).toHaveLength(2);
    expect(listed.every((course) => course.myGrant?.status === 'active')).toBe(true);
    for (const course of listed) {
      expect((await student.get(`/api/v1/courses/${course.id}`)).statusCode).toBe(200);
    }
  });

  it('leaves the second student with an expired and a revoked grant, so no content', async () => {
    await seedDemoData(ctx.app.db);
    const other = await signIn('student2@opencourse.example');
    const listed = (await other.get('/api/v1/courses')).json().courses as Array<{
      id: string;
      myGrant: { status: string } | null;
    }>;
    expect(listed.map((course) => course.myGrant?.status ?? null).sort()).toEqual([
      'expired',
      null,
    ]);
    for (const course of listed) {
      expect((await other.get(`/api/v1/courses/${course.id}`)).statusCode).toBe(403);
    }
  });

  it('seeds courses that pass the publish check and have the draft the instructor can open', async () => {
    await seedDemoData(ctx.app.db);
    for (const row of await ctx.app.db.select().from(courses)) {
      const detail = await loadCourseDetail(ctx.app.db, row);
      if (row.status === 'published') expect(getPublishIssues(detail)).toEqual([]);
    }
    const instructor = await signIn('instructor@opencourse.example');
    const managed = (await instructor.get('/api/v1/courses?scope=managed')).json().courses;
    expect(managed).toHaveLength(3);
    const draft = managed.find((course: { status: string }) => course.status === 'draft');
    const opened = await instructor.get(`/api/v1/courses/${draft.id}`);
    expect(courseResponseSchema.safeParse(opened.json()).success).toBe(true);
  });

  it('is idempotent: running again adds nothing', async () => {
    await seedDemoData(ctx.app.db);
    const count = async () => ({
      users: (await ctx.app.db.select().from(users)).length,
      courses: (await ctx.app.db.select().from(courses)).length,
      grants: (await ctx.app.db.select().from(grants)).length,
    });
    const before = await count();
    await seedDemoData(ctx.app.db);
    await seedDemoData(ctx.app.db);
    expect(await count()).toEqual(before);
  });

  it('never overwrites an existing account or course of the same name', async () => {
    await seedDemoData(ctx.app.db);
    await ctx.app.db
      .update(users)
      .set({ passwordHash: 'kept', name: 'Kept' })
      .where(eq(users.email, 'student@opencourse.example'));
    await ctx.app.db.update(courses).set({ status: 'archived' }).where(eq(courses.status, 'draft'));

    await seedDemoData(ctx.app.db);
    const [student] = await ctx.app.db
      .select()
      .from(users)
      .where(eq(users.email, 'student@opencourse.example'));
    expect(student).toMatchObject({ passwordHash: 'kept', name: 'Kept' });
    expect(
      (await ctx.app.db.select().from(courses).where(eq(courses.status, 'draft'))).length,
    ).toBe(0);
  });

  it('keeps the account list in one place', () => {
    expect(DEMO_ACCOUNTS.map((account) => account.email)).toEqual([
      'admin@opencourse.example',
      'instructor@opencourse.example',
      'student@opencourse.example',
      'student2@opencourse.example',
    ]);
  });

  it('refuses to run in production before touching any database', async () => {
    await expect(
      runSeedDemo('postgres://nobody:nothing@127.0.0.1:1/none', { NODE_ENV: 'production' }),
    ).rejects.toThrow(/production/);
  });
});
