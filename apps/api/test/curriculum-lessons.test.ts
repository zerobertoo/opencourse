import { courseResponseSchema, createLessonResponseSchema } from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { lessons } from '../src/db/schema';
import { createCast, insertCourseWithLesson, insertLesson } from './fixtures';
import { createTestApp, resetDatabase, type TestApp } from './helpers';

function validQuiz() {
  return {
    passingScore: 60,
    questions: [
      {
        id: randomUUID(),
        translations: [{ locale: 'en', prompt: 'Is it?', explanation: 'It is.' }],
        options: [
          { id: randomUUID(), isCorrect: true, translations: [{ locale: 'en', text: 'Yes' }] },
          { id: randomUUID(), isCorrect: false, translations: [{ locale: 'en', text: 'No' }] },
        ],
      },
    ],
  };
}

describe('lesson routes', () => {
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

  async function draftWithLesson() {
    const cast = await createCast(ctx.app);
    const fixture = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'draft',
    });
    return { cast, ...fixture };
  }

  it('creates each lesson type with its empty defaults, at the end of the module', async () => {
    const { cast, courseModule } = await draftWithLesson();
    const url = `/api/v1/modules/${courseModule.id}/lessons`;
    const created: Record<string, unknown> = {};
    for (const type of ['video', 'text', 'file', 'quiz'] as const) {
      const response = await cast.instructorA.client.post(url, { type, title: type, locale: 'en' });
      expect(response.statusCode).toBe(201);
      const body = createLessonResponseSchema.parse(response.json());
      created[type] = body.course.modules[0]!.lessons.find((item) => item.id === body.lessonId);
    }
    expect(created.video).toMatchObject({ type: 'video', order: 1, video: null, captions: [] });
    expect(created.text).toMatchObject({ type: 'text', order: 2, durationSeconds: 0 });
    expect(created.file).toMatchObject({ type: 'file', order: 3, attachments: [] });
    expect(created.quiz).toMatchObject({
      type: 'quiz',
      order: 4,
      quiz: { passingScore: 70, questions: [] },
    });
    const blank = await cast.instructorA.client.post(url, {
      type: 'text',
      title: ' ',
      locale: 'en',
    });
    expect(blank.statusCode).toBe(400);
  });

  it('merges lesson translations and updates the fields of its type', async () => {
    const { cast, courseModule, lesson } = await draftWithLesson();
    const text = await cast.instructorA.client.patch(`/api/v1/lessons/${lesson.id}`, {
      translations: [{ locale: 'pt-BR', title: 'Aula', content: '# Olá' }],
      durationSeconds: 300,
    });
    expect(text.statusCode).toBe(200);
    const updated = courseResponseSchema.parse(text.json()).course.modules[0]!.lessons[0]!;
    expect(updated.durationSeconds).toBe(300);
    expect(updated.translations.map((item) => item.locale)).toEqual(['en', 'pt-BR']);

    const video = await insertLesson(ctx.app, courseModule.id, 1, { title: 'V', type: 'video' });
    const linked = await cast.instructorA.client.patch(`/api/v1/lessons/${video.id}`, {
      video: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      captions: [{ locale: 'en', url: 'https://cdn.example.com/en.vtt' }],
    });
    expect(linked.statusCode).toBe(200);
    expect(linked.json().course.modules[0].lessons[1]).toMatchObject({
      video: { provider: 'external', status: 'ready' },
      captions: [{ locale: 'en', url: 'https://cdn.example.com/en.vtt' }],
    });
    const removed = await cast.instructorA.client.patch(`/api/v1/lessons/${video.id}`, {
      video: null,
    });
    expect(removed.json().course.modules[0].lessons[1].video).toBeNull();

    const quizLesson = await insertLesson(ctx.app, courseModule.id, 2, {
      title: 'Q',
      type: 'quiz',
    });
    const quiz = validQuiz();
    const saved = await cast.instructorA.client.patch(`/api/v1/lessons/${quizLesson.id}`, {
      quiz,
    });
    expect(saved.statusCode).toBe(200);
    // the manager sees the answers back
    expect(saved.json().course.modules[0].lessons[2].quiz).toEqual(quiz);
  });

  it('refuses fields of another lesson type and malformed quizzes, changing nothing', async () => {
    const { cast, lesson } = await draftWithLesson();
    const url = `/api/v1/lessons/${lesson.id}`;
    for (const body of [
      { quiz: validQuiz() },
      { video: { url: 'https://youtu.be/dQw4w9WgXcQ' } },
      { captions: [] },
      { durationSeconds: 1.5 },
      { durationSeconds: 1, attachments: [] },
      {},
    ]) {
      const response = await cast.instructorA.client.patch(url, body);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('validation');
    }
    const [row] = await ctx.app.db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(row).toMatchObject({ type: 'text', quiz: null, video: null, durationSeconds: 60 });

    const quizLesson = await insertLesson(ctx.app, lesson.moduleId, 1, {
      title: 'Q',
      type: 'quiz',
    });
    const repeatedIds = validQuiz();
    repeatedIds.questions[0]!.options[1]!.id = repeatedIds.questions[0]!.options[0]!.id;
    const refused = await cast.instructorA.client.patch(`/api/v1/lessons/${quizLesson.id}`, {
      quiz: repeatedIds,
    });
    expect(refused.statusCode).toBe(400);

    const video = await insertLesson(ctx.app, lesson.moduleId, 2, { title: 'V', type: 'video' });
    const insecure = await cast.instructorA.client.patch(`/api/v1/lessons/${video.id}`, {
      video: { url: 'http://youtu.be/dQw4w9WgXcQ' },
    });
    expect(insecure.statusCode).toBe(400);
  });

  it('deletes a lesson and renumbers the rest of its module', async () => {
    const { cast, courseModule, lesson } = await draftWithLesson();
    const middle = await insertLesson(ctx.app, courseModule.id, 1, { title: 'Middle' });
    const last = await insertLesson(ctx.app, courseModule.id, 2, { title: 'Last' });
    const response = await cast.instructorA.client.delete(`/api/v1/lessons/${middle.id}`);
    expect(response.statusCode).toBe(200);
    const remaining = courseResponseSchema.parse(response.json()).course.modules[0]!.lessons;
    expect(remaining.map((item) => [item.id, item.order])).toEqual([
      [lesson.id, 0],
      [last.id, 1],
    ]);
  });

  it('keeps a published course publishable: no last-lesson delete, no wiped title, new video lessons allowed', async () => {
    const cast = await createCast(ctx.app);
    const { courseModule, lesson } = await insertCourseWithLesson(ctx.app, {
      instructorId: cast.instructorA.userId,
      status: 'published',
    });
    const client = cast.instructorA.client;

    const deleted = await client.delete(`/api/v1/lessons/${lesson.id}`);
    expect(deleted.statusCode).toBe(400);
    expect(deleted.json().error.details.issues).toEqual(['noLessons']);
    const kept = await ctx.app.db.select().from(lessons).where(eq(lessons.id, lesson.id));
    expect(kept).toHaveLength(1);

    const wiped = await client.patch(`/api/v1/lessons/${lesson.id}`, {
      translations: [{ locale: 'en', title: '', content: '' }],
    });
    expect(wiped.statusCode).toBe(400);
    expect(wiped.json().error.details.issues).toEqual(['untitledItems']);

    const added = await client.post(`/api/v1/modules/${courseModule.id}/lessons`, {
      type: 'video',
      title: 'Coming soon',
      locale: 'en',
    });
    expect(added.statusCode).toBe(201);
    const videoId = added.json().lessonId as string;
    const edited = await client.patch(`/api/v1/lessons/${lesson.id}`, { durationSeconds: 120 });
    expect(edited.statusCode).toBe(200);

    const ready = await client.patch(`/api/v1/lessons/${videoId}`, {
      video: { url: 'https://vimeo.com/42' },
    });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().course.status).toBe('published');
    // with the video lesson in place, the first one is no longer the last
    expect((await client.delete(`/api/v1/lessons/${lesson.id}`)).statusCode).toBe(200);
  });
});
