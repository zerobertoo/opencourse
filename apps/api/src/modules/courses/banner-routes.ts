import { randomUUID } from 'node:crypto';
import {
  BANNER_MAX_BYTES,
  bannerFileParamsSchema,
  completeBannerUploadRequestSchema,
  courseResponseSchema,
  coverParamsSchema,
  createBannerUploadRequestSchema,
  createBannerUploadResponseSchema,
  uploadedBannerPath,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, type CourseRow } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { authContext } from '../../plugins/auth';
import { requireManagedCourseById } from './access';
import {
  BANNER_READ_TTL_SECONDS,
  BANNER_UPLOAD_TTL_SECONDS,
  bannerFileKey,
  deleteReplacedBanner,
} from './banner';
import { loadCourseDetail } from './detail';

/** Banner images: direct upload to the storage, then a stable address on the API. */
export const bannerRoutes: FastifyPluginAsyncZod = async (app) => {
  async function managedCourse(request: FastifyRequest, courseId: string) {
    return requireManagedCourseById(app.db, authContext(request).user, courseId);
  }

  async function changeBanner(request: FastifyRequest, course: CourseRow, url: string | null) {
    const [updated] = await app.db
      .update(courses)
      .set({ bannerImageUrl: url, updatedAt: new Date() })
      .where(eq(courses.id, course.id))
      .returning();
    if (!updated) throw notFound('Course not found');
    if (course.bannerImageUrl !== url) {
      await deleteReplacedBanner(app.storage, course.id, course.bannerImageUrl, request.log);
    }
    return { course: await loadCourseDetail(app.db, updated) };
  }

  app.post(
    '/courses/:id/banner',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Start uploading a banner image for a course',
        description:
          'PUT the whole image to `uploadUrl` with the same Content-Type, then call /banner/complete.',
        params: coverParamsSchema,
        body: createBannerUploadRequestSchema,
        response: { 200: createBannerUploadResponseSchema },
      },
    },
    async (request) => {
      const course = await managedCourse(request, request.params.id);
      const { contentType, sizeBytes } = request.body;
      const bannerId = randomUUID();
      const uploadUrl = await app.storage.presignPut(
        bannerFileKey(course.id, bannerId),
        contentType,
        sizeBytes,
        BANNER_UPLOAD_TTL_SECONDS,
      );
      return { bannerId, uploadUrl };
    },
  );

  app.post(
    '/courses/:id/banner/complete',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Finish a banner upload and make it the course banner',
        description: 'The previous uploaded banner, if any, is deleted.',
        params: coverParamsSchema,
        body: completeBannerUploadRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { bannerId } = request.body;
      const course = await managedCourse(request, request.params.id);
      const key = bannerFileKey(course.id, bannerId);
      const stored = await app.storage.sizeOf(key);
      if (stored === null) throw badRequest('The banner was not uploaded');
      if (stored > BANNER_MAX_BYTES) {
        await app.storage.deleteObject(key);
        throw badRequest(`Banners can be at most ${BANNER_MAX_BYTES} bytes`);
      }
      return changeBanner(request, course, uploadedBannerPath(course.id, bannerId));
    },
  );

  app.delete(
    '/courses/:id/banner',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Remove the banner of a course',
        description: 'The home hero goes back to the cover.',
        params: coverParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => changeBanner(request, await managedCourse(request, request.params.id), null),
  );

  app.get(
    '/courses/:id/banner/:bannerId',
    {
      // public on purpose, like the cover: an <img> cannot renew an expired session
      schema: {
        tags: ['files'],
        summary: 'Banner image of a course',
        description:
          'Answers with a redirect to a short-lived address of the image. Only the current banner answers.',
        params: bannerFileParamsSchema,
      },
    },
    async (request, reply) => {
      const { id, bannerId } = request.params;
      const [course] = await app.db
        .select({ bannerImageUrl: courses.bannerImageUrl })
        .from(courses)
        .where(eq(courses.id, id));
      if (course?.bannerImageUrl !== uploadedBannerPath(id, bannerId)) {
        throw notFound('Banner not found');
      }

      const address = await app.storage.presignGet(
        bannerFileKey(id, bannerId),
        BANNER_READ_TTL_SECONDS,
      );
      return reply
        .header('cache-control', `private, max-age=${BANNER_READ_TTL_SECONDS / 2}`)
        .redirect(address, 302);
    },
  );
};
