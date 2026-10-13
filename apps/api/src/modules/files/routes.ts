import {
  CAPTION_MAX_BYTES,
  attachmentDownloadParamsSchema,
  attachmentDownloadResponseSchema,
  attachmentParamsSchema,
  captionFileParamsSchema,
  captionParamsSchema,
  completeAttachmentResponseSchema,
  courseResponseSchema,
  createAttachmentRequestSchema,
  createAttachmentResponseSchema,
  lessonIdParamsSchema,
  localeSchema,
  toWebVtt,
  uploadedCaptionPath,
} from '@opencourse/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../../config';
import { lessonAttachments, lessons } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../errors';
import { requireManagedCourse, resolveCourseAccess } from '../courses/access';
import { changeCurriculum, findCourseOfLesson } from '../courses/curriculum';
import { loadCourseDetail } from '../courses/detail';
import {
  ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  ATTACHMENT_UPLOAD_TTL_SECONDS,
  attachmentDisposition,
  cleanFileName,
  findAttachmentContext,
  findLessonAttachment,
  lessonFileKeys,
  toFileAttachment,
} from './service';

export interface FileRoutesOptions {
  config: Config;
}

export const fileRoutes: FastifyPluginAsyncZod<FileRoutesOptions> = async (app, { config }) => {
  /** A lesson the caller may edit; invisible and unknown lessons look the same. */
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
    '/lessons/:id/attachments',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Start uploading an attachment to a lesson',
        description:
          'PUT the whole file to `uploadUrl` with the same Content-Type, then call /complete.',
        params: lessonIdParamsSchema,
        body: createAttachmentRequestSchema,
        response: { 200: createAttachmentResponseSchema },
      },
    },
    async (request) => {
      const { lesson } = await managedLesson(request, request.params.id);
      const { filename, contentType, sizeBytes } = request.body;
      if (sizeBytes > config.ATTACHMENT_MAX_BYTES) {
        throw badRequest(`Attachments can be at most ${config.ATTACHMENT_MAX_BYTES} bytes`, {
          maxBytes: config.ATTACHMENT_MAX_BYTES,
        });
      }

      const [created] = await app.db
        .insert(lessonAttachments)
        .values({
          lessonId: lesson.id,
          name: cleanFileName(filename),
          sizeBytes,
          contentType,
          position: sql`(select coalesce(max(position) + 1, 0) from lesson_attachments where lesson_id = ${lesson.id})`,
        })
        .returning({ id: lessonAttachments.id });
      if (!created) throw new Error('Failed to create the attachment');

      const uploadUrl = await app.storage.presignPut(
        lessonFileKeys.attachment(lesson.id, created.id),
        contentType,
        sizeBytes,
        ATTACHMENT_UPLOAD_TTL_SECONDS,
      );
      return { attachmentId: created.id, uploadUrl };
    },
  );

  app.post(
    '/lessons/:id/attachments/:attachmentId/complete',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Finish an attachment upload',
        params: attachmentParamsSchema,
        response: { 200: completeAttachmentResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedLesson(request, request.params.id);
      const attachment = await findLessonAttachment(app.db, lesson.id, request.params.attachmentId);
      if (!attachment) throw notFound('Attachment not found');

      if (attachment.status === 'uploading') {
        const key = lessonFileKeys.attachment(lesson.id, attachment.id);
        const stored = await app.storage.sizeOf(key);
        if (stored !== attachment.sizeBytes) {
          await app.storage
            .deleteObject(key)
            .catch((error: unknown) =>
              request.log.warn(
                { err: error, attachmentId: attachment.id },
                'could not delete a bad upload',
              ),
            );
          await app.db.delete(lessonAttachments).where(eq(lessonAttachments.id, attachment.id));
          throw badRequest('The uploaded file does not match the announced size');
        }
        await app.db
          .update(lessonAttachments)
          .set({ status: 'ready' })
          .where(eq(lessonAttachments.id, attachment.id));
      }
      return {
        attachment: toFileAttachment({ ...attachment, status: 'ready' }),
        course: await loadCourseDetail(app.db, course),
      };
    },
  );

  app.delete(
    '/lessons/:id/attachments/:attachmentId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Remove an attachment from a lesson',
        params: attachmentParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedLesson(request, request.params.id);
      const attachment = await findLessonAttachment(app.db, lesson.id, request.params.attachmentId);
      if (!attachment) throw notFound('Attachment not found');
      await app.db.delete(lessonAttachments).where(eq(lessonAttachments.id, attachment.id));
      await app.storage
        .deleteObject(lessonFileKeys.attachment(lesson.id, attachment.id))
        .catch((error: unknown) =>
          request.log.warn({ err: error, attachmentId: attachment.id }, 'could not delete a file'),
        );
      return { course: await loadCourseDetail(app.db, course) };
    },
  );

  app.get(
    '/attachments/:id/download',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Address to download an attachment from',
        description:
          'Checks the access and answers with a short-lived address that saves the file. It is a ' +
          'request of its own (not a redirect) so the web app can renew an expired session first.',
        params: attachmentDownloadParamsSchema,
        response: { 200: attachmentDownloadResponseSchema },
      },
    },
    async (request, reply) => {
      const context = await findAttachmentContext(app.db, request.params.id);
      if (!context) throw notFound('Attachment not found');
      const access = await resolveCourseAccess(
        app.db,
        request.auth!.user,
        context.course,
        new Date(),
      );
      if (!access.isVisible) throw notFound('Attachment not found');
      if (!access.canViewContent) throw forbidden('Access to this course requires a grant');
      // a half-sent file is only the instructor's business, so it looks missing to everyone
      if (context.attachment.status !== 'ready') throw notFound('Attachment not found');

      const address = await app.storage.presignGet(
        lessonFileKeys.attachment(context.lesson.id, context.attachment.id),
        ATTACHMENT_DOWNLOAD_TTL_SECONDS,
        attachmentDisposition(context.attachment.name),
      );
      return reply.header('cache-control', 'private, no-store').send({ url: address });
    },
  );

  app.put(
    '/lessons/:id/captions/:locale',
    {
      preHandler: app.authenticate,
      bodyLimit: CAPTION_MAX_BYTES,
      schema: {
        tags: ['files'],
        summary: 'Add or replace the captions of a video lesson in one language',
        description: 'Send WebVTT or SRT as text/plain; SRT is stored as WebVTT.',
        params: captionParamsSchema,
        body: z.string(),
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { id: lessonId, locale } = request.params;
      const { course, lesson } = await managedLesson(request, lessonId);
      if (lesson.type !== 'video') throw badRequest('Only video lessons have captions');
      const vtt = toWebVtt(request.body);
      if (vtt === null) throw badRequest('The captions must be a WebVTT or SRT file');

      await app.storage.putText(lessonFileKeys.caption(lessonId, locale), vtt, 'text/vtt');
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: false },
        async (tx) => {
          const [current] = await tx
            .select({ captions: lessons.captions })
            .from(lessons)
            .where(eq(lessons.id, lessonId));
          const others = (current?.captions ?? []).filter((item) => item.locale !== locale);
          await tx
            .update(lessons)
            .set({
              captions: [...others, { locale, url: uploadedCaptionPath(lessonId, locale) }].sort(
                (a, b) => a.locale.localeCompare(b.locale),
              ),
            })
            .where(eq(lessons.id, lessonId));
        },
      );
      return { course: detail };
    },
  );

  app.delete(
    '/lessons/:id/captions/:locale',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Remove the captions of a video lesson in one language',
        params: captionParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { id: lessonId, locale } = request.params;
      const { course, lesson } = await managedLesson(request, lessonId);
      if (!lesson.captions.some((item) => item.locale === locale)) {
        throw notFound('Captions not found');
      }
      const { course: detail } = await changeCurriculum(
        app.db,
        course.id,
        { checkPublish: false },
        async (tx) => {
          const [current] = await tx
            .select({ captions: lessons.captions })
            .from(lessons)
            .where(eq(lessons.id, lessonId));
          await tx
            .update(lessons)
            .set({ captions: (current?.captions ?? []).filter((item) => item.locale !== locale) })
            .where(eq(lessons.id, lessonId));
        },
      );
      await app.storage
        .deleteObject(lessonFileKeys.caption(lessonId, locale))
        .catch((error: unknown) =>
          request.log.warn({ err: error, lessonId, locale }, 'could not delete a caption file'),
        );
      return { course: detail };
    },
  );

  app.get(
    '/lessons/:id/captions/:file',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'WebVTT captions of a lesson in one language',
        params: captionFileParamsSchema,
      },
    },
    async (request, reply) => {
      const found = await findCourseOfLesson(app.db, request.params.id);
      if (!found) throw notFound('Captions not found');
      const access = await resolveCourseAccess(
        app.db,
        request.auth!.user,
        found.course,
        new Date(),
      );
      if (!access.isVisible) throw notFound('Captions not found');
      if (!access.canViewContent) throw forbidden('Access to this course requires a grant');

      const locale = localeSchema.safeParse(request.params.file.slice(0, -'.vtt'.length));
      const path = locale.success ? uploadedCaptionPath(found.lesson.id, locale.data) : null;
      if (!locale.success || !found.lesson.captions.some((item) => item.url === path)) {
        throw notFound('Captions not found');
      }
      // the entry can outlive its file after a failed cleanup; that is a missing caption, not a fault
      const body = await app.storage
        .readText(lessonFileKeys.caption(found.lesson.id, locale.data))
        .catch((error: unknown) => {
          if ((error as { name?: string }).name === 'NoSuchKey')
            throw notFound('Captions not found');
          throw error;
        });
      return reply
        .header('content-type', 'text/vtt; charset=utf-8')
        .header('cache-control', 'private, no-store')
        .send(body);
    },
  );
};
