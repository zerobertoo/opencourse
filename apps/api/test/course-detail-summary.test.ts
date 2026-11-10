import { getCourseSummaryStats } from '@opencourse/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessonTranslations } from '../src/db/schema';
import { loadCourseDetails } from '../src/modules/courses/detail';
import { createCast, insertCourse, insertLesson, insertModule } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

describe('course detail in summary mode', () => {
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

  it('keeps what a listing needs and leaves out the lesson text', async () => {
    const cast = await createCast(ctx.app);
    const course = await insertCourse(ctx.app, { instructorId: cast.instructorA.userId });
    const courseModule = await insertModule(ctx.app, course.id, 0, 'Module');
    const lesson = await insertLesson(ctx.app, courseModule.id, 0, {
      title: 'Lesson',
      durationSeconds: 90,
    });
    await ctx.app.db.update(lessonTranslations).set({ content: 'a long body of text' });

    const [full] = await loadCourseDetails(ctx.app.db, [course]);
    const [summary] = await loadCourseDetails(ctx.app.db, [course], { summary: true });

    expect(full!.modules[0]!.lessons[0]!.translations[0]!.content).toBe('a long body of text');
    expect(summary!.modules[0]!.lessons[0]!.id).toBe(lesson.id);
    expect(summary!.modules[0]!.lessons[0]!.translations[0]!.content).toBe('');
    expect(getCourseSummaryStats(summary!)).toEqual(getCourseSummaryStats(full!));
  });
});
