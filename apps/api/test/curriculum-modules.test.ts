import { courseResponseSchema, createModuleResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessons, lessonTranslations, modules } from '../src/db/schema';
import {
  createCast,
  insertCourse,
  insertCourseWithLesson,
  insertLesson,
  insertModule,
} from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('module routes', () => {
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

  it('appends a module with its title and returns the course and the new id', async () => {
    const cast = await createCast(ctx.app);
    const { course } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const response = await cast.instructorA.client.post(`/api/v1/courses/${course.id}/modules`, {
      title: ' Second ',
      locale: 'en',
    });
    expect(response.statusCode).toBe(201);
    const body = createModuleResponseSchema.parse(response.json());
    expect(body.course.modules.map((item) => item.order)).toEqual([0, 1]);
    const created = body.course.modules[1]!;
    expect(created.id).toBe(body.moduleId);
    expect(created.translations).toEqual([{ locale: 'en', title: 'Second' }]);
    expect(created.lessons).toEqual([]);
  });

  it('gives modules created at the same time distinct positions', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const url = `/api/v1/courses/${course.id}/modules`;
    await Promise.all(
      ['A', 'B', 'C', 'D'].map((title) =>
        cast.instructorA.client.post(url, { title, locale: 'en' }),
      ),
    );
    const rows = await ctx.app.db.select().from(modules).where(eq(modules.courseId, course.id));
    expect(rows.map((row) => row.position).sort()).toEqual([0, 1, 2, 3]);
  });

  it('merges module titles by locale and rejects bad bodies', async () => {
    const cast = await createCast(ctx.app);
    const { courseModule } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const url = `/api/v1/modules/${courseModule.id}`;
    const response = await cast.instructorA.client.patch(url, {
      translations: [{ locale: 'pt-BR', title: 'Módulo' }],
    });
    expect(response.statusCode).toBe(200);
    const { course } = courseResponseSchema.parse(response.json());
    expect(course.modules[0]!.translations).toEqual([
      { locale: 'en', title: 'Module' },
      { locale: 'pt-BR', title: 'Módulo' },
    ]);

    for (const body of [
      {},
      { translations: [] },
      { translations: [{ locale: 'fr', title: 'x' }] },
      {
        translations: [
          { locale: 'en', title: 'a' },
          { locale: 'en', title: 'b' },
        ],
      },
      { translations: [{ locale: 'en', title: 'a' }], position: 3 },
    ]) {
      expect((await cast.instructorA.client.patch(url, body)).statusCode).toBe(400);
    }
  });

  it('deletes a module with its lessons and renumbers the others', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const first = await insertModule(ctx.app, course.id, 0, 'First');
    const middle = await insertModule(ctx.app, course.id, 1, 'Middle');
    await insertModule(ctx.app, course.id, 2, 'Last');
    const lesson = await insertLesson(ctx.app, middle.id, 0, { title: 'Gone' });

    const response = await cast.instructorA.client.delete(`/api/v1/modules/${middle.id}`);
    expect(response.statusCode).toBe(200);
    const { course: detail } = courseResponseSchema.parse(response.json());
    expect(detail.modules.map((item) => [item.translations[0]!.title, item.order])).toEqual([
      ['First', 0],
      ['Last', 1],
    ]);
    expect(detail.modules[0]!.id).toBe(first.id);
    expect(await ctx.app.db.select().from(lessons).where(eq(lessons.id, lesson.id))).toEqual([]);
    expect(
      await ctx.app.db
        .select()
        .from(lessonTranslations)
        .where(eq(lessonTranslations.lessonId, lesson.id)),
    ).toEqual([]);
  });

  it('refuses to delete the module holding the only lessons of a published course', async () => {
    const cast = await createCast(ctx.app);
    const { courseModule } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'published',
    });
    const response = await cast.instructorA.client.delete(`/api/v1/modules/${courseModule.id}`);
    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.issues).toEqual(['noLessons']);
    const rows = await ctx.app.db.select().from(modules).where(eq(modules.id, courseModule.id));
    expect(rows).toHaveLength(1);
  });
});
