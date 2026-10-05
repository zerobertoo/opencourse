import { apiErrorSchema, courseResponseSchema } from '@opencourse/shared';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, courses } from '../src/db/schema';
import {
  createCast,
  insertCourse,
  insertCourseWithLesson,
  insertLesson,
  insertModule,
} from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

describe('writing courses', () => {
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

  it('lets instructors and admins create drafts owned by themselves; students cannot', async () => {
    const cast = await createCast(ctx.app);
    const created = await cast.instructorA.client.post('/api/v1/courses', {
      title: 'Introdução ao JavaScript',
      description: 'Do zero',
      defaultLocale: 'pt-BR',
    });
    expect(created.statusCode).toBe(201);
    const { course } = courseResponseSchema.parse(created.json());
    expect(course).toMatchObject({
      slug: 'introducao-ao-javascript',
      status: 'draft',
      instructorId: cast.instructorA.userId,
      defaultLocale: 'pt-BR',
      sequentialOrder: false,
      modules: [],
    });
    expect(course.translations).toEqual([
      {
        locale: 'pt-BR',
        title: 'Introdução ao JavaScript',
        description: 'Do zero',
        learningOutcomes: [],
      },
    ]);

    const body = { title: 'X', defaultLocale: 'en' };
    expect((await cast.admin.client.post('/api/v1/courses', body)).statusCode).toBe(201);
    expect((await cast.student.client.post('/api/v1/courses', body)).statusCode).toBe(403);
    expect((await new TestClient(ctx.app).post('/api/v1/courses', body)).statusCode).toBe(401);
  });

  it('gives colliding titles distinct slugs, and an emoji-only title a valid one', async () => {
    const cast = await createCast(ctx.app);
    const slugs: string[] = [];
    for (const title of ['Same title', 'Same title', 'Same title', '🚀']) {
      const response = await cast.instructorA.client.post('/api/v1/courses', {
        title,
        defaultLocale: 'en',
      });
      slugs.push(response.json().course.slug);
    }
    expect(slugs).toEqual(['same-title', 'same-title-2', 'same-title-3', 'course']);
  });

  it('rejects invalid creation bodies with the shared error shape', async () => {
    const cast = await createCast(ctx.app);
    const bodies = [
      {},
      { title: '   ', defaultLocale: 'en' },
      { title: 'A', defaultLocale: 'fr' },
      { title: 'x'.repeat(201), defaultLocale: 'en' },
    ];
    for (const body of bodies) {
      const response = await cast.instructorA.client.post('/api/v1/courses', body);
      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('validation');
    }
  });

  it('merges translations by locale and keeps the others', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
      title: 'English title',
      defaultLocale: 'en',
    });
    const response = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      translations: [
        { locale: 'pt-BR', title: 'Título', description: 'Desc', learningOutcomes: ['A'] },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(
      response.json().course.translations.map((item: { locale: string }) => item.locale),
    ).toEqual(['en', 'pt-BR']);

    const again = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      translations: [
        { locale: 'pt-BR', title: 'Novo título', description: '', learningOutcomes: [] },
      ],
    });
    expect(again.json().course.translations).toHaveLength(2);
    expect(again.json().course.translations[1].title).toBe('Novo título');
  });

  it('updates settings and the cover, and the slug can never be changed', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const url = `/api/v1/courses/${course.id}`;
    const ok = await cast.instructorA.client.patch(url, {
      sequentialOrder: true,
      coverImageUrl: 'https://cdn.example.com/cover.png',
      certificateTemplate: {
        enabled: false,
        signatoryName: 'Ines',
        signatoryRole: 'Instructor',
        message: 'Well done',
      },
    });
    expect(ok.json().course).toMatchObject({
      sequentialOrder: true,
      coverImageUrl: 'https://cdn.example.com/cover.png',
    });

    const invalidBodies = [
      { slug: 'hacked' },
      { coverImageUrl: 'http://x.test/a.png' },
      {},
      { translations: [{ locale: 'fr', title: 'x', description: '', learningOutcomes: [] }] },
    ];
    for (const body of invalidBodies) {
      expect((await cast.instructorA.client.patch(url, body)).statusCode).toBe(400);
    }
    const [row] = await ctx.app.db.select().from(courses).where(eq(courses.id, course.id));
    expect(row?.slug).toBe(course.slug);
  });

  it('enforces ownership: other instructors and students are refused, admins are not', async () => {
    const cast = await createCast(ctx.app);
    const owner = cast.instructorA.userId;
    const published = await insertCourse(ctx.app, { instructorId: owner, status: 'published' });
    const draft = await insertCourse(ctx.app, { instructorId: owner, status: 'draft' });
    const body = { sequentialOrder: true };
    const patch = (client: TestClient, id: string) => client.patch(`/api/v1/courses/${id}`, body);

    // visible but not theirs: 403
    expect((await patch(cast.instructorB.client, published.id)).statusCode).toBe(403);
    expect((await patch(cast.student.client, published.id)).statusCode).toBe(403);
    // invisible: 404, so the draft's existence stays hidden
    expect((await patch(cast.instructorB.client, draft.id)).statusCode).toBe(404);
    expect((await patch(cast.student.client, draft.id)).statusCode).toBe(404);
    expect((await patch(new TestClient(ctx.app), published.id)).statusCode).toBe(401);

    expect((await patch(cast.admin.client, draft.id)).statusCode).toBe(200);
    const [row] = await ctx.app.db.select().from(courses).where(eq(courses.id, published.id));
    expect(row?.sequentialOrder).toBe(false);
  });

  it('refuses to publish while the shared publish check reports issues, and says which', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const refused = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      status: 'published',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.details.issues).toContain('noLessons');
    const [row] = await ctx.app.db.select().from(courses).where(eq(courses.id, course.id));
    expect(row?.status).toBe('draft');
  });

  it('publishes a ready course, audits status changes, and keeps checking while published', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
      title: 'Ready',
    });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    await insertLesson(ctx.app, courseModule.id, 0, { title: 'Lesson' });
    const url = `/api/v1/courses/${course.id}`;

    const published = await cast.instructorA.client.patch(url, { status: 'published' });
    expect(published.statusCode).toBe(200);
    expect(published.json().course.status).toBe('published');

    // wiping the default-locale title of a published course would break it
    const broken = await cast.instructorA.client.patch(url, {
      translations: [{ locale: 'en', title: '', description: '', learningOutcomes: [] }],
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json().error.details.issues).toContain('missingTitle');

    const archived = await cast.instructorA.client.patch(url, { status: 'archived' });
    expect(archived.statusCode).toBe(200);

    const entries = await ctx.app.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.targetId, course.id))
      .orderBy(asc(auditLog.createdAt));
    expect(entries.map((entry) => entry.action)).toEqual([
      'course.status_changed',
      'course.status_changed',
    ]);
    expect(entries.map((entry) => entry.metadata)).toEqual([
      { from: 'draft', to: 'published' },
      { from: 'published', to: 'archived' },
    ]);
  });

  it('lets a published course keep issues it already had, but never gain new ones', async () => {
    const cast = await createCast(ctx.app);
    const { course, courseModule } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'published',
    });
    // a video lesson added after publishing has no video yet
    await insertLesson(ctx.app, courseModule.id, 1, { title: 'Video', type: 'video' });
    const url = `/api/v1/courses/${course.id}`;

    const settings = await cast.instructorA.client.patch(url, { sequentialOrder: true });
    expect(settings.statusCode).toBe(200);

    const wiped = await cast.instructorA.client.patch(url, {
      translations: [{ locale: 'en', title: '', description: '', learningOutcomes: [] }],
    });
    expect(wiped.statusCode).toBe(400);
    expect(wiped.json().error.details.issues).toEqual(['missingTitle']);
  });

  it('still refuses to publish a course with any issue, old or new', async () => {
    const cast = await createCast(ctx.app);
    const { course } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
      lessonType: 'video',
    });
    const refused = await cast.instructorA.client.patch(`/api/v1/courses/${course.id}`, {
      status: 'published',
    });
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.details.issues).toEqual(['videoNotReady']);
  });
});
