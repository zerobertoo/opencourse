import {
  courseIdParamsSchema,
  courseResponseSchema,
  createLessonRequestSchema,
  createLessonResponseSchema,
  createModuleRequestSchema,
  createModuleResponseSchema,
  lessonIdParamsSchema,
  moduleIdParamsSchema,
  reorderCurriculumRequestSchema,
  updateLessonRequestSchema,
  updateModuleRequestSchema,
} from '@opencourse/shared';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  courses,
  lessons,
  lessonTranslations,
  moduleTranslations,
  modules,
  videoAssets,
} from '../../db/schema';
import { conflict } from '../../errors';
import { deleteVideoFiles, videoAssetsOfLessons } from '../video/service';
import { requireManagedCourse } from './access';
import {
  changeCurriculum,
  findCourseOfLesson,
  findCourseOfModule,
  listsEachOnce,
  nextLessonPosition,
  nextModulePosition,
} from './curriculum';
import { DEFAULT_QUIZ, toLessonColumns } from './lesson-fields';

export const curriculumRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Course owning the module, under the course rules: unknown and invisible look the same. */
  async function managedCourseOfModule(request: FastifyRequest, moduleId: string) {
    const course = await findCourseOfModule(app.db, moduleId);
    return requireManagedCourse(app.db, request.auth!.user, course, 'Module not found');
  }

  /** Lesson and its course, under the course rules: unknown and invisible look the same. */
  async function managedLesson(request: FastifyRequest, lessonId: string) {
    const found = await findCourseOfLesson(app.db, lessonId);
    const course = await requireManagedCourse(
      app.db,
      request.auth!.user,
      found?.course,
      'Lesson not found',
    );
    return { course, lesson: found!.lesson };
  }

  app.post(
    '/courses/:id/modules',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Append a module to a course',
        params: courseIdParamsSchema,
        body: createModuleRequestSchema,
        response: { 201: createModuleResponseSchema },
      },
    },
    async (request, reply) => {
      const [existing] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, request.params.id));
      const course = await requireManagedCourse(app.db, request.auth!.user, existing);
      const { title, locale } = request.body;

      const { course: detail, result: moduleId } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: false },
        async (tx) => {
          const position = await nextModulePosition(tx, course.id);
          const [created] = await tx
            .insert(modules)
            .values({ courseId: course.id, position })
            .returning({ id: modules.id });
          if (!created) throw new Error('Failed to create module');
          await tx.insert(moduleTranslations).values({ moduleId: created.id, locale, title });
          return created.id;
        },
      );
      return reply.code(201).send({ course: detail, moduleId });
    },
  );

  app.patch(
    '/modules/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Update a module',
        description: 'Titles are merged by locale.',
        params: moduleIdParamsSchema,
        body: updateModuleRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const moduleId = request.params.id;
      const course = await managedCourseOfModule(request, moduleId);
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: true },
        async (tx) => {
          for (const translation of request.body.translations) {
            await tx
              .insert(moduleTranslations)
              .values({ moduleId, ...translation })
              .onConflictDoUpdate({
                target: [moduleTranslations.moduleId, moduleTranslations.locale],
                set: { title: translation.title },
              });
          }
        },
      );
      return { course: detail };
    },
  );

  app.delete(
    '/modules/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Delete a module and its lessons',
        params: moduleIdParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const moduleId = request.params.id;
      const course = await managedCourseOfModule(request, moduleId);
      const lessonIds = (
        await app.db.select({ id: lessons.id }).from(lessons).where(eq(lessons.moduleId, moduleId))
      ).map((row) => row.id);
      const videoIds = await videoAssetsOfLessons(app.db, lessonIds);
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: true },
        async (tx) => {
          // lessons, translations and uploaded videos go with it (on delete cascade)
          await tx.delete(modules).where(eq(modules.id, moduleId));
        },
      );
      await deleteVideoFiles(app.storage, videoIds, request.log);
      return { course: detail };
    },
  );

  app.post(
    '/modules/:id/lessons',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Append a lesson to a module',
        description: 'Video and quiz lessons start empty; fill them with PATCH /lessons/:id.',
        params: moduleIdParamsSchema,
        body: createLessonRequestSchema,
        response: { 201: createLessonResponseSchema },
      },
    },
    async (request, reply) => {
      const moduleId = request.params.id;
      const course = await managedCourseOfModule(request, moduleId);
      const { type, title, locale } = request.body;

      const { course: detail, result: lessonId } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: false },
        async (tx) => {
          const position = await nextLessonPosition(tx, moduleId);
          const [created] = await tx
            .insert(lessons)
            .values({
              moduleId,
              position,
              type,
              durationSeconds: 0,
              quiz: type === 'quiz' ? DEFAULT_QUIZ : null,
            })
            .returning({ id: lessons.id });
          if (!created) throw new Error('Failed to create lesson');
          await tx
            .insert(lessonTranslations)
            .values({ lessonId: created.id, locale, title, content: '' });
          return created.id;
        },
      );
      return reply.code(201).send({ course: detail, lessonId });
    },
  );

  app.patch(
    '/lessons/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Update a lesson',
        description:
          'Translations are merged by locale. Video, captions and quiz only apply to their lesson type.',
        params: lessonIdParamsSchema,
        body: updateLessonRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedLesson(request, request.params.id);
      const { translations, ...fields } = request.body;
      // validate before opening the transaction
      const columns = toLessonColumns(lesson.type, fields);
      // a pasted link (or removing the video) replaces an uploaded file, so its files go too
      const replacedVideoIds =
        fields.video !== undefined ? await videoAssetsOfLessons(app.db, [lesson.id]) : [];

      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: true },
        async (tx) => {
          if (fields.video !== undefined) {
            await tx.delete(videoAssets).where(eq(videoAssets.lessonId, lesson.id));
          }
          if (Object.keys(columns).length > 0) {
            await tx.update(lessons).set(columns).where(eq(lessons.id, lesson.id));
          }
          for (const translation of translations ?? []) {
            await tx
              .insert(lessonTranslations)
              .values({ lessonId: lesson.id, ...translation })
              .onConflictDoUpdate({
                target: [lessonTranslations.lessonId, lessonTranslations.locale],
                set: { title: translation.title, content: translation.content },
              });
          }
        },
      );
      await deleteVideoFiles(app.storage, replacedVideoIds, request.log);
      return { course: detail };
    },
  );

  app.delete(
    '/lessons/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Delete a lesson',
        params: lessonIdParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedLesson(request, request.params.id);
      const videoIds = await videoAssetsOfLessons(app.db, [lesson.id]);
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: true },
        async (tx) => {
          await tx.delete(lessons).where(eq(lessons.id, lesson.id));
        },
      );
      await deleteVideoFiles(app.storage, videoIds, request.log);
      return { course: detail };
    },
  );

  app.put(
    '/courses/:id/curriculum',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['curriculum'],
        summary: 'Reorder the whole curriculum',
        description:
          'The layout must list every module and lesson of the course exactly once (409 otherwise). ' +
          'Lessons may move between modules.',
        params: courseIdParamsSchema,
        body: reorderCurriculumRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const [existing] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, request.params.id));
      const course = await requireManagedCourse(app.db, request.auth!.user, existing);
      const layout = request.body.modules;

      // the order of the curriculum never adds or removes a publish issue
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: false },
        async (tx) => {
          // compared under the course lock, so a concurrent edit cannot slip in between
          const moduleIds = (
            await tx.select({ id: modules.id }).from(modules).where(eq(modules.courseId, course.id))
          ).map((row) => row.id);
          const lessonIds = moduleIds.length
            ? (
                await tx
                  .select({ id: lessons.id })
                  .from(lessons)
                  .where(inArray(lessons.moduleId, moduleIds))
              ).map((row) => row.id)
            : [];
          const matches =
            listsEachOnce(
              layout.map((item) => item.moduleId),
              moduleIds,
            ) &&
            listsEachOnce(
              layout.flatMap((item) => item.lessonIds),
              lessonIds,
            );
          if (!matches) {
            throw conflict(
              'The layout must list every module and lesson of the course exactly once',
            );
          }

          for (const [moduleIndex, item] of layout.entries()) {
            await tx
              .update(modules)
              .set({ position: moduleIndex })
              .where(eq(modules.id, item.moduleId));
            for (const [lessonIndex, lessonId] of item.lessonIds.entries()) {
              await tx
                .update(lessons)
                .set({ moduleId: item.moduleId, position: lessonIndex })
                .where(eq(lessons.id, lessonId));
            }
          }
        },
      );
      return { course: detail };
    },
  );
};
