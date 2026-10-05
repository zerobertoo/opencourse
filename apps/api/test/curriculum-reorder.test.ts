import { courseResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessons } from '../src/db/schema';
import {
  createCast,
  insertCourse,
  insertCourseWithLesson,
  insertLesson,
  insertModule,
} from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('curriculum reorder', () => {
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

  /** Two modules: M1 with L1, L2 and M2 with L3. */
  async function setup() {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const m1 = await insertModule(ctx.app, course.id, 0, 'M1');
    const m2 = await insertModule(ctx.app, course.id, 1, 'M2');
    const l1 = await insertLesson(ctx.app, m1.id, 0, { title: 'L1' });
    const l2 = await insertLesson(ctx.app, m1.id, 1, { title: 'L2' });
    const l3 = await insertLesson(ctx.app, m2.id, 0, { title: 'L3' });
    const url = `/api/v1/courses/${course.id}/curriculum`;
    return { cast, m1, m2, l1, l2, l3, url };
  }

  it('reorders modules and moves lessons between them', async () => {
    const { cast, m1, m2, l1, l2, l3, url } = await setup();
    const response = await cast.instructorA.client.put(url, {
      modules: [
        { moduleId: m2.id, lessonIds: [l3.id, l1.id] },
        { moduleId: m1.id, lessonIds: [l2.id] },
      ],
    });
    expect(response.statusCode).toBe(200);
    const { course } = courseResponseSchema.parse(response.json());
    expect(
      course.modules.map((item) => ({
        id: item.id,
        order: item.order,
        lessons: item.lessons.map((lesson) => [lesson.id, lesson.order, lesson.moduleId]),
      })),
    ).toEqual([
      {
        id: m2.id,
        order: 0,
        lessons: [
          [l3.id, 0, m2.id],
          [l1.id, 1, m2.id],
        ],
      },
      { id: m1.id, order: 1, lessons: [[l2.id, 0, m1.id]] },
    ]);
  });

  it('answers 409 when the layout misses, repeats or invents an item, and changes nothing', async () => {
    const { cast, m1, m2, l1, l2, l3, url } = await setup();
    const other = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const layouts = [
      // a lesson is missing
      [
        { moduleId: m1.id, lessonIds: [l1.id, l2.id] },
        { moduleId: m2.id, lessonIds: [] },
      ],
      // a lesson is listed twice
      [
        { moduleId: m1.id, lessonIds: [l1.id, l2.id, l1.id] },
        { moduleId: m2.id, lessonIds: [l3.id] },
      ],
      // a module is missing
      [{ moduleId: m1.id, lessonIds: [l1.id, l2.id, l3.id] }],
      // a module is listed twice
      [
        { moduleId: m1.id, lessonIds: [l1.id, l2.id] },
        { moduleId: m1.id, lessonIds: [l3.id] },
      ],
      // right counts, but a lesson of another course replaces L3
      [
        { moduleId: m1.id, lessonIds: [l1.id, l2.id] },
        { moduleId: m2.id, lessonIds: [other.lesson.id] },
      ],
      // right counts, but a module of another course replaces M2
      [
        { moduleId: m1.id, lessonIds: [l1.id, l2.id] },
        { moduleId: other.courseModule.id, lessonIds: [l3.id] },
      ],
      [],
    ];
    for (const modules of layouts) {
      const response = await cast.instructorA.client.put(url, { modules });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('conflict');
    }
    const [foreign] = await ctx.app.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, other.lesson.id));
    expect(foreign).toMatchObject({ moduleId: other.courseModule.id, position: 0 });
    const [kept] = await ctx.app.db.select().from(lessons).where(eq(lessons.id, l3.id));
    expect(kept).toMatchObject({ moduleId: m2.id, position: 0 });
  });

  it('accepts an empty layout for an empty course and rejects malformed bodies', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    const url = `/api/v1/courses/${course.id}/curriculum`;
    expect((await cast.instructorA.client.put(url, { modules: [] })).statusCode).toBe(200);
    expect((await cast.instructorA.client.put(url, [])).statusCode).toBe(400);
    const malformed = await cast.instructorA.client.put(url, {
      modules: [{ moduleId: 'x', lessonIds: [] }],
    });
    expect(malformed.statusCode).toBe(400);
  });
});
