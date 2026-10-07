import { courseResponseSchema, listCoursesResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { grants } from '../src/db/schema';
import { createCast, insertCourse, insertGrant, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

describe('reading courses', () => {
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

  const titles = (response: LightMyRequestResponse): string[] =>
    (response.json().courses as Array<{ translations: Array<{ title: string }> }>)
      .map((course) => course.translations[0]?.title ?? '')
      .sort();

  async function scenario() {
    const cast = await createCast(ctx.app);
    const owner = cast.instructorA.userId;
    const published = await insertCourse(ctx.app, {
      instructorId: owner,
      title: 'Published',
      slug: 'published',
    });
    const draft = await insertCourse(ctx.app, {
      instructorId: owner,
      title: 'Draft',
      slug: 'draft',
      status: 'draft',
    });
    const archived = await insertCourse(ctx.app, {
      instructorId: owner,
      title: 'Archived',
      slug: 'archived',
      status: 'archived',
    });
    const courseModule = await insertModule(ctx.app, published.id, 0, 'Module');
    await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Quiz',
      type: 'quiz',
      quiz: {
        passingScore: 70,
        questions: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            translations: [{ locale: 'en', prompt: 'Q', explanation: 'Secret reason' }],
            options: [
              {
                id: '00000000-0000-4000-8000-000000000002',
                isCorrect: true,
                translations: [{ locale: 'en', text: 'A' }],
              },
              {
                id: '00000000-0000-4000-8000-000000000003',
                isCorrect: false,
                translations: [{ locale: 'en', text: 'B' }],
              },
            ],
          },
        ],
      },
    });
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: published.id,
      createdById: cast.admin.userId,
    });
    return { cast, published, draft, archived };
  }

  it('requires a session', async () => {
    await scenario();
    const anonymous = new TestClient(ctx.app);
    expect((await anonymous.get('/api/v1/courses')).statusCode).toBe(401);
    expect((await anonymous.get('/api/v1/courses/by-slug/published')).statusCode).toBe(401);
  });

  it('lists the catalog: published courses, plus archived ones the user holds a grant for', async () => {
    const { cast, archived } = await scenario();
    expect(titles(await cast.otherStudent.client.get('/api/v1/courses'))).toEqual(['Published']);

    await insertGrant(ctx.app, {
      userId: cast.otherStudent.userId,
      courseId: archived.id,
      createdById: cast.admin.userId,
    });
    const response = await cast.otherStudent.client.get('/api/v1/courses');
    expect(titles(response)).toEqual(['Archived', 'Published']);
    expect(listCoursesResponseSchema.safeParse(response.json()).success).toBe(true);
    expect(response.body).not.toContain('"modules"');
  });

  it('lists summaries with curriculum stats and the caller own open grant', async () => {
    const { cast, published } = await scenario();
    const find = (response: LightMyRequestResponse) =>
      (response.json().courses as Array<Record<string, unknown>>).find(
        (course) => course.id === published.id,
      )!;

    const granted = find(await cast.student.client.get('/api/v1/courses'));
    expect(granted).toMatchObject({
      moduleCount: 1,
      lessonCount: 1,
      durationSeconds: 60,
      completeLocales: ['en'],
      myGrant: { userId: cast.student.userId, courseId: published.id, status: 'active' },
    });
    // nobody else's grant leaks into the list
    expect(find(await cast.otherStudent.client.get('/api/v1/courses')).myGrant).toBeNull();
    expect(find(await cast.admin.client.get('/api/v1/courses')).myGrant).toBeNull();
    // the managed scope carries the same stats
    expect(find(await cast.instructorA.client.get('/api/v1/courses?scope=managed'))).toMatchObject({
      moduleCount: 1,
      lessonCount: 1,
    });

    await ctx.app.db
      .update(grants)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(grants.userId, cast.student.userId));
    expect(find(await cast.student.client.get('/api/v1/courses')).myGrant).toMatchObject({
      status: 'expired',
    });

    await ctx.app.db
      .update(grants)
      .set({ revokedAt: new Date() })
      .where(eq(grants.userId, cast.student.userId));
    expect(find(await cast.student.client.get('/api/v1/courses')).myGrant).toBeNull();
  });

  it('counts the curriculum of every listed course, not just the first', async () => {
    const { cast } = await scenario();
    const second = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      title: 'Second',
      slug: 'second',
    });
    const first = await insertModule(ctx.app, second.id, 0, 'One');
    const other = await insertModule(ctx.app, second.id, 1, 'Two');
    await insertLesson(ctx.app, first.id, 0, { title: 'A', durationSeconds: 100 });
    await insertLesson(ctx.app, first.id, 1, { title: 'B', durationSeconds: 200 });
    await insertLesson(ctx.app, other.id, 0, { title: 'C', durationSeconds: 300 });

    const response = await cast.admin.client.get('/api/v1/courses?scope=managed');
    const byTitle = Object.fromEntries(
      (
        response.json().courses as Array<{
          translations: Array<{ title: string }>;
          moduleCount: number;
          lessonCount: number;
          durationSeconds: number;
        }>
      ).map((course) => [course.translations[0]?.title, course]),
    );
    expect(byTitle.Second).toMatchObject({ moduleCount: 2, lessonCount: 3, durationSeconds: 600 });
    expect(byTitle.Published).toMatchObject({ moduleCount: 1, lessonCount: 1 });
    expect(byTitle.Draft).toMatchObject({ moduleCount: 0, lessonCount: 0, durationSeconds: 0 });
  });

  it('lists managed courses: all for admins, own for instructors, forbidden for students', async () => {
    const { cast } = await scenario();
    const url = '/api/v1/courses?scope=managed';
    const everything = ['Archived', 'Draft', 'Published'];
    expect(titles(await cast.admin.client.get(url))).toEqual(everything);
    expect(titles(await cast.instructorA.client.get(url))).toEqual(everything);
    expect(titles(await cast.instructorB.client.get(url))).toEqual([]);
    expect((await cast.student.client.get(url)).statusCode).toBe(403);
  });

  it('filters by status and searches any translation title, treating % and _ literally', async () => {
    const { cast } = await scenario();
    const own = '/api/v1/courses?scope=managed';
    expect(titles(await cast.admin.client.get(`${own}&status=draft`))).toEqual(['Draft']);
    expect(titles(await cast.admin.client.get(`${own}&search=PUBL`))).toEqual(['Published']);
    expect(titles(await cast.admin.client.get(`${own}&search=%25`))).toEqual([]);
    expect(titles(await cast.admin.client.get(`${own}&search=_ublished`))).toEqual([]);
  });

  it('opens a course by id and by slug with the same body for people with access', async () => {
    const { cast, published } = await scenario();
    const byId = await cast.student.client.get(`/api/v1/courses/${published.id}`);
    const bySlug = await cast.student.client.get('/api/v1/courses/by-slug/published');
    expect(byId.statusCode).toBe(200);
    expect(bySlug.json()).toEqual(byId.json());
    expect(courseResponseSchema.safeParse(byId.json()).success).toBe(true);
  });

  it('hides drafts and ungranted archived courses with 404 from students and other instructors', async () => {
    const { cast, draft, archived } = await scenario();
    for (const client of [cast.student.client, cast.instructorB.client]) {
      expect((await client.get(`/api/v1/courses/${draft.id}`)).statusCode).toBe(404);
      expect((await client.get('/api/v1/courses/by-slug/draft')).statusCode).toBe(404);
      expect((await client.get(`/api/v1/courses/${archived.id}`)).statusCode).toBe(404);
    }
    expect((await cast.instructorA.client.get(`/api/v1/courses/${draft.id}`)).statusCode).toBe(200);
    expect((await cast.admin.client.get(`/api/v1/courses/${draft.id}`)).statusCode).toBe(200);
  });

  it('answers 403 to a visible course without a grant, 404 to an unknown id and 400 to a malformed one', async () => {
    const { cast, published } = await scenario();
    expect((await cast.otherStudent.client.get(`/api/v1/courses/${published.id}`)).statusCode).toBe(
      403,
    );
    const unknown = '/api/v1/courses/00000000-0000-4000-8000-0000000000ff';
    expect((await cast.student.client.get(unknown)).statusCode).toBe(404);
    expect((await cast.student.client.get('/api/v1/courses/not-a-uuid')).statusCode).toBe(400);
  });

  it('stops serving content once the grant expires or is revoked, while the summary stays listed', async () => {
    const { cast, published } = await scenario();
    const url = `/api/v1/courses/${published.id}`;
    expect((await cast.student.client.get(url)).statusCode).toBe(200);

    await ctx.app.db.update(grants).set({ expiresAt: new Date(Date.now() - 60_000) });
    expect((await cast.student.client.get(url)).statusCode).toBe(403);

    await ctx.app.db.update(grants).set({ expiresAt: null, revokedAt: new Date() });
    expect((await cast.student.client.get(url)).statusCode).toBe(403);
    expect(titles(await cast.student.client.get('/api/v1/courses'))).toEqual(['Published']);
  });

  it('never sends quiz answers to people who cannot manage the course', async () => {
    const { cast, published } = await scenario();
    const asStudent = await cast.student.client.get(`/api/v1/courses/${published.id}`);
    expect(asStudent.body).not.toContain('isCorrect');
    expect(asStudent.body).not.toContain('Secret reason');

    const asOwner = await cast.instructorA.client.get(`/api/v1/courses/${published.id}`);
    expect(asOwner.body).toContain('isCorrect');
    expect(asOwner.body).toContain('Secret reason');
  });
});
