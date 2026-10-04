import { flattenLessons } from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { createServicesSignedInAs, createTestServices } from '@/test/mock-services';

async function setup(userSlug = 'rafael', options = {}) {
  const context = createTestServices(options);
  await context.services.auth.signIn(`${userSlug}@opencourse.example`, 'qualquer-senha');
  const { services } = context;
  const created = await services.courses.create({
    title: 'Curso de teste',
    defaultLocale: 'pt-BR',
  });
  return { services, courseId: created.id };
}

describe('mock curriculum service', () => {
  describe('modules', () => {
    it('creates, renames and deletes modules keeping the order consecutive', async () => {
      const { services, courseId } = await setup();
      const first = await services.curriculum.createModule({
        courseId,
        title: ' Introdução ',
        locale: 'pt-BR',
      });
      const second = await services.curriculum.createModule({
        courseId,
        title: 'Avançado',
        locale: 'pt-BR',
      });
      expect(second.course.modules.map((m) => [m.id, m.order])).toEqual([
        [first.moduleId, 0],
        [second.moduleId, 1],
      ]);
      expect(second.course.modules[0]?.translations[0]?.title).toBe('Introdução');

      const renamed = await services.curriculum.updateModule(first.moduleId, {
        translations: [{ locale: 'en', title: 'Introduction' }],
      });
      expect(renamed.modules[0]?.translations.map((t) => t.locale)).toEqual(['pt-BR', 'en']);

      const afterDelete = await services.curriculum.deleteModule(first.moduleId);
      expect(afterDelete.modules.map((m) => [m.id, m.order])).toEqual([[second.moduleId, 0]]);
    });

    it('requires a title', async () => {
      const { services, courseId } = await setup();
      await expect(
        services.curriculum.createModule({ courseId, title: '  ', locale: 'pt-BR' }),
      ).rejects.toMatchObject({ code: 'validation' });
    });
  });

  describe('lessons', () => {
    it.each([
      ['video', { type: 'video', video: null, captions: [] }],
      ['text', { type: 'text' }],
      ['file', { type: 'file' }],
      ['quiz', { type: 'quiz', quiz: { passingScore: 70, questions: [] } }],
    ] as const)('creates an empty %s lesson', async (type, expected) => {
      const { services, courseId } = await setup();
      const { moduleId } = await services.curriculum.createModule({
        courseId,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      const { course, lessonId } = await services.curriculum.createLesson({
        moduleId,
        type,
        title: 'Aula nova',
        locale: 'pt-BR',
      });
      const lesson = flattenLessons(course).find((item) => item.id === lessonId);
      expect(lesson).toMatchObject({
        ...expected,
        moduleId,
        order: 0,
        durationSeconds: 0,
        attachments: [],
        translations: [{ locale: 'pt-BR', title: 'Aula nova', content: '' }],
      });
    });

    it('updates translations by locale and duration, and adds and removes attachments', async () => {
      const { services, courseId } = await setup();
      const { moduleId } = await services.curriculum.createModule({
        courseId,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      const { lessonId } = await services.curriculum.createLesson({
        moduleId,
        type: 'text',
        title: 'Texto',
        locale: 'pt-BR',
      });
      const updated = await services.curriculum.updateLesson(lessonId, {
        translations: [{ locale: 'en', title: 'Text', content: '# Hello' }],
        durationSeconds: 300,
      });
      const withFile = await services.curriculum.addLessonAttachments(lessonId, [
        { name: 'a.pdf', sizeBytes: 10, url: '/a.pdf' },
      ]);
      const lesson = flattenLessons(updated)[0]!;
      expect(lesson.translations.map((t) => t.locale)).toEqual(['pt-BR', 'en']);
      expect(lesson).toMatchObject({ durationSeconds: 300 });
      const [attachment] = flattenLessons(withFile)[0]!.attachments;
      expect(attachment).toMatchObject({ name: 'a.pdf', sizeBytes: 10 });
      expect(attachment!.id).not.toBe('');
      const withoutFile = await services.curriculum.removeLessonAttachment(lessonId, attachment!.id);
      expect(flattenLessons(withoutFile)[0]!.attachments).toHaveLength(0);
    });

    it('rejects fields that do not apply to the lesson type and invalid values', async () => {
      const { services, courseId } = await setup();
      const { moduleId } = await services.curriculum.createModule({
        courseId,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      const { lessonId } = await services.curriculum.createLesson({
        moduleId,
        type: 'text',
        title: 'Texto',
        locale: 'pt-BR',
      });
      await expect(
        services.curriculum.updateLesson(lessonId, { captions: [] }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.curriculum.updateLesson(lessonId, { quiz: { passingScore: 70, questions: [] } }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.curriculum.updateLesson(lessonId, { durationSeconds: -1 }),
      ).rejects.toMatchObject({ code: 'validation' });
    });

    it('saves a quiz and rejects an out-of-range passing score', async () => {
      const { services, courseId } = await setup();
      const { moduleId } = await services.curriculum.createModule({
        courseId,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      const { lessonId } = await services.curriculum.createLesson({
        moduleId,
        type: 'quiz',
        title: 'Quiz',
        locale: 'pt-BR',
      });
      const quiz = {
        passingScore: 80,
        questions: [
          {
            id: 'q1',
            translations: [{ locale: 'pt-BR' as const, prompt: 'P?', explanation: '' }],
            options: [
              { id: 'a', isCorrect: true, translations: [{ locale: 'pt-BR' as const, text: 'A' }] },
              {
                id: 'b',
                isCorrect: false,
                translations: [{ locale: 'pt-BR' as const, text: 'B' }],
              },
            ],
          },
        ],
      };
      const saved = await services.curriculum.updateLesson(lessonId, { quiz });
      expect(flattenLessons(saved)[0]).toMatchObject({ type: 'quiz', quiz });

      await expect(
        services.curriculum.updateLesson(lessonId, { quiz: { ...quiz, passingScore: 120 } }),
      ).rejects.toMatchObject({ code: 'validation' });
    });

    it('deleting a lesson also removes the progress students recorded on it', async () => {
      const { services } = await createServicesSignedInAs('rafael');
      const { store } = services.mock;
      const course = await services.courses.getBySlug('fundamentos-de-javascript');
      const lessonId = 'les-js-1-2';
      expect(store.db.progress.some((entry) => entry.lessonId === lessonId)).toBe(true);

      const updated = await services.curriculum.deleteLesson(lessonId);

      expect(flattenLessons(updated)).toHaveLength(flattenLessons(course).length - 1);
      expect(store.db.progress.some((entry) => entry.lessonId === lessonId)).toBe(false);
      // order stays consecutive inside the module
      expect(updated.modules[0]?.lessons.map((lesson) => lesson.order)).toEqual([0, 1, 2]);
    });
  });

  describe('video', () => {
    async function videoLesson(options = {}) {
      const context = await setup('rafael', options);
      const { services, courseId } = context;
      const { moduleId } = await services.curriculum.createModule({
        courseId,
        title: 'Módulo',
        locale: 'pt-BR',
      });
      const { lessonId } = await services.curriculum.createLesson({
        moduleId,
        type: 'video',
        title: 'Vídeo',
        locale: 'pt-BR',
      });
      return { ...context, lessonId };
    }
    const videoOf = async (
      services: Awaited<ReturnType<typeof setup>>['services'],
      courseId: string,
    ) => {
      const lesson = flattenLessons(await services.courses.getById(courseId))[0];
      return lesson?.type === 'video' ? lesson.video : undefined;
    };

    it('processes a local upload and then marks it ready', async () => {
      const { services, courseId, lessonId } = await videoLesson({ videoProcessingMs: 20 });
      await services.curriculum.setLessonVideo(lessonId, {
        provider: 'local',
        fileName: 'aula.mp4',
      });
      expect(await videoOf(services, courseId)).toMatchObject({
        provider: 'local',
        status: 'processing',
        playbackUrl: null,
      });

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(await videoOf(services, courseId)).toMatchObject({
        status: 'ready',
        playbackUrl: '/media/sample-lesson.mp4',
      });
    });

    it('is ready immediately when processing takes no time', async () => {
      const { services, courseId, lessonId } = await videoLesson({ videoProcessingMs: 0 });
      await services.curriculum.setLessonVideo(lessonId, {
        provider: 'local',
        fileName: 'aula.webm',
      });
      expect(await videoOf(services, courseId)).toMatchObject({ status: 'ready' });
    });

    it('does not let a stale upload override a newer external video or a removal', async () => {
      const { services, courseId, lessonId } = await videoLesson({ videoProcessingMs: 20 });
      await services.curriculum.setLessonVideo(lessonId, { provider: 'local', fileName: 'a.mp4' });
      await services.curriculum.setLessonVideo(lessonId, {
        provider: 'external',
        url: 'https://videos.example/abc',
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(await videoOf(services, courseId)).toMatchObject({
        provider: 'external',
        playbackUrl: 'https://videos.example/abc',
      });

      await services.curriculum.removeLessonVideo(lessonId);
      expect(await videoOf(services, courseId)).toBeNull();
    });

    it('validates the file format and the external URL', async () => {
      const { services, lessonId } = await videoLesson();
      await expect(
        services.curriculum.setLessonVideo(lessonId, { provider: 'local', fileName: 'notas.txt' }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.curriculum.setLessonVideo(lessonId, { provider: 'external', url: 'javascript:1' }),
      ).rejects.toMatchObject({ code: 'validation' });
      await expect(
        services.curriculum.setLessonVideo(lessonId, { provider: 'external', url: 'nao é url' }),
      ).rejects.toMatchObject({ code: 'validation' });
    });
  });

  describe('reorder', () => {
    async function twoModules() {
      const { services, courseId } = await setup();
      const make = async (title: string, lessons: string[]) => {
        const { moduleId } = await services.curriculum.createModule({
          courseId,
          title,
          locale: 'pt-BR',
        });
        const ids: string[] = [];
        for (const lessonTitle of lessons) {
          const { lessonId } = await services.curriculum.createLesson({
            moduleId,
            type: 'text',
            title: lessonTitle,
            locale: 'pt-BR',
          });
          ids.push(lessonId);
        }
        return { moduleId, ids };
      };
      const a = await make('A', ['a1', 'a2']);
      const b = await make('B', ['b1']);
      return { services, courseId, a, b };
    }

    it('reorders modules and moves lessons between modules in one batch', async () => {
      const { services, courseId, a, b } = await twoModules();
      const [a1, a2] = a.ids as [string, string];
      const updated = await services.curriculum.reorder(courseId, [
        { moduleId: b.moduleId, lessonIds: [a2, ...b.ids] },
        { moduleId: a.moduleId, lessonIds: [a1] },
      ]);

      expect(updated.modules.map((m) => [m.id, m.order])).toEqual([
        [b.moduleId, 0],
        [a.moduleId, 1],
      ]);
      expect(updated.modules[0]?.lessons.map((l) => [l.id, l.order, l.moduleId])).toEqual([
        [a2, 0, b.moduleId],
        [b.ids[0], 1, b.moduleId],
      ]);
      expect(flattenLessons(updated).map((lesson) => lesson.id)).toEqual([a2, b.ids[0], a1]);
    });

    it('rejects layouts that drop, repeat or invent modules and lessons', async () => {
      const { services, courseId, a, b } = await twoModules();
      const [a1, a2] = a.ids as [string, string];
      const attempts = [
        // missing lesson
        [
          { moduleId: a.moduleId, lessonIds: [a1] },
          { moduleId: b.moduleId, lessonIds: b.ids },
        ],
        // repeated lesson
        [
          { moduleId: a.moduleId, lessonIds: [a1, a2, a1] },
          { moduleId: b.moduleId, lessonIds: b.ids },
        ],
        // missing module
        [{ moduleId: a.moduleId, lessonIds: [a1, a2, ...b.ids] }],
        // unknown lesson
        [
          { moduleId: a.moduleId, lessonIds: [a1, 'nope'] },
          { moduleId: b.moduleId, lessonIds: b.ids },
        ],
      ];
      for (const layout of attempts) {
        await expect(services.curriculum.reorder(courseId, layout)).rejects.toMatchObject({
          code: 'validation',
        });
      }
    });
  });

  it('only lets the course owner or an admin edit the curriculum', async () => {
    const { services, courseId } = await setup('rafael');
    const { moduleId } = await services.curriculum.createModule({
      courseId,
      title: 'Módulo',
      locale: 'pt-BR',
    });
    const owner = services.auth;

    await owner.signIn('beatriz@opencourse.example', 'x');
    await expect(
      services.curriculum.createModule({ courseId, title: 'Intruso', locale: 'pt-BR' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(services.curriculum.deleteModule(moduleId)).rejects.toMatchObject({
      code: 'forbidden',
    });

    await owner.signIn('lucas@opencourse.example', 'x');
    await expect(services.curriculum.deleteModule(moduleId)).rejects.toMatchObject({
      code: 'forbidden',
    });

    await owner.signIn('marina@opencourse.example', 'x');
    await expect(services.curriculum.deleteModule(moduleId)).resolves.toBeTruthy();
  });
});
