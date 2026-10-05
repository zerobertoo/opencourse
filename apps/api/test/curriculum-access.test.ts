import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { courses } from '../src/db/schema';
import { loadCourseDetail } from '../src/modules/courses/detail';
import { createCast, insertCourseWithLesson, insertGrant } from './fixtures';
import { createTestApp, resetDatabase, TestClient, type TestApp } from './helpers';

interface Target {
  courseId: string;
  moduleId: string;
  lessonId: string;
}

interface Route {
  name: string;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: (target: Target) => string;
  body?: (target: Target) => unknown;
}

/** Every curriculum route, aimed at one course's ids. */
const routes: Route[] = [
  {
    name: 'create module',
    method: 'POST',
    url: (t) => `/api/v1/courses/${t.courseId}/modules`,
    body: () => ({ title: 'Injected', locale: 'en' }),
  },
  {
    name: 'update module',
    method: 'PATCH',
    url: (t) => `/api/v1/modules/${t.moduleId}`,
    body: () => ({ translations: [{ locale: 'en', title: 'Hacked' }] }),
  },
  { name: 'delete module', method: 'DELETE', url: (t) => `/api/v1/modules/${t.moduleId}` },
  {
    name: 'create lesson',
    method: 'POST',
    url: (t) => `/api/v1/modules/${t.moduleId}/lessons`,
    body: () => ({ type: 'text', title: 'Injected', locale: 'en' }),
  },
  {
    name: 'update lesson',
    method: 'PATCH',
    url: (t) => `/api/v1/lessons/${t.lessonId}`,
    body: () => ({ durationSeconds: 1 }),
  },
  { name: 'delete lesson', method: 'DELETE', url: (t) => `/api/v1/lessons/${t.lessonId}` },
  {
    name: 'reorder',
    method: 'PUT',
    url: (t) => `/api/v1/courses/${t.courseId}/curriculum`,
    body: (t) => ({ modules: [{ moduleId: t.moduleId, lessonIds: [t.lessonId] }] }),
  },
];

describe('curriculum authorization', () => {
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
    const toTarget = (fixture: Awaited<ReturnType<typeof insertCourseWithLesson>>): Target => ({
      courseId: fixture.course.id,
      moduleId: fixture.courseModule.id,
      lessonId: fixture.lesson.id,
    });
    const published = toTarget(
      await insertCourseWithLesson(ctx.app, {
        instructorId: cast.instructorA.userId,
        status: 'published',
      }),
    );
    const draft = toTarget(
      await insertCourseWithLesson(ctx.app, {
        instructorId: cast.instructorA.userId,
        status: 'draft',
      }),
    );
    await insertGrant(ctx.app, {
      userId: cast.student.userId,
      courseId: published.courseId,
      createdById: cast.instructorA.userId,
    });
    const unknown: Target = {
      courseId: randomUUID(),
      moduleId: randomUUID(),
      lessonId: randomUUID(),
    };
    return { cast, published, draft, unknown };
  }

  async function snapshot(courseId: string) {
    const [row] = await ctx.app.db.select().from(courses).where(eq(courses.id, courseId));
    return loadCourseDetail(ctx.app.db, row!);
  }

  it.each(routes)(
    '$name: other instructors and students are refused, and ids never leak',
    async (route) => {
      const { cast, published, draft, unknown } = await setup();
      const call = (client: TestClient, target: Target) =>
        client.request(route.method, route.url(target), { body: route.body?.(target) });
      const before = {
        published: await snapshot(published.courseId),
        draft: await snapshot(draft.courseId),
      };

      // visible but not theirs: 403, the granted student included
      expect((await call(cast.instructorB.client, published)).statusCode).toBe(403);
      expect((await call(cast.student.client, published)).statusCode).toBe(403);
      expect((await call(cast.otherStudent.client, published)).statusCode).toBe(403);
      // a draft of someone else looks exactly like an id that does not exist
      const hidden = await call(cast.instructorB.client, draft);
      const missing = await call(cast.instructorB.client, unknown);
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json()).toEqual(missing.json());
      expect((await call(cast.student.client, draft)).statusCode).toBe(404);
      expect((await call(new TestClient(ctx.app), published)).statusCode).toBe(401);

      expect(await snapshot(published.courseId)).toEqual(before.published);
      expect(await snapshot(draft.courseId)).toEqual(before.draft);

      // the owner and an admin may change the draft (a second delete has nothing left to delete)
      const owner = await call(cast.instructorA.client, draft);
      expect([200, 201]).toContain(owner.statusCode);
      if (route.method !== 'DELETE') {
        const admin = await call(cast.admin.client, draft);
        expect([200, 201]).toContain(admin.statusCode);
      }
    },
  );

  it('refuses an instructor demoted to student, even on their own course', async () => {
    const { cast, draft } = await setup();
    const demoted = await cast.admin.client.patch(
      `/api/v1/admin/users/${cast.instructorA.userId}/role`,
      { role: 'student' },
    );
    expect(demoted.statusCode).toBe(200);
    // the session user is reloaded on every request, so the draft is hidden at once
    const response = await cast.instructorA.client.patch(`/api/v1/modules/${draft.moduleId}`, {
      translations: [{ locale: 'en', title: 'Mine?' }],
    });
    expect(response.statusCode).toBe(404);
  });
});
