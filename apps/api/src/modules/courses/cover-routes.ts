import { randomUUID } from 'node:crypto';
import {
  COVER_MAX_BYTES,
  completeCoverUploadRequestSchema,
  courseResponseSchema,
  coverFileParamsSchema,
  coverParamsSchema,
  createCoverUploadRequestSchema,
  createCoverUploadResponseSchema,
  uploadedCoverPath,
} from '@opencourse/shared';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, type CourseRow } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { requireManagedCourse } from './access';
import {
  COVER_READ_TTL_SECONDS,
  COVER_UPLOAD_TTL_SECONDS,
  coverFileKey,
  deleteReplacedCover,
} from './cover';
import { loadCourseDetail } from './detail';

/** Cover images: direct upload to the storage, then a stable address on the API. */
export const coverRoutes: FastifyPluginAsyncZod = async (app) => {
  async function managedCourse(request: FastifyRequest, courseId: string) {
    const [existing] = await app.db.select().from(courses).where(eq(courses.id, courseId));
    return requireManagedCourse(app.db, request.auth!.user, existing);
  }

  /** Points the course at `url` (or at nothing) and removes the file it used to point at. */
  async function changeCover(request: FastifyRequest, course: CourseRow, url: string | null) {
    const [updated] = await app.db
      .update(courses)
      .set({ coverImageUrl: url, updatedAt: new Date() })
      .where(eq(courses.id, course.id))
      .returning();
    if (!updated) throw notFound('Course not found');
    if (course.coverImageUrl !== url) {
      await deleteReplacedCover(app.storage, course.id, course.coverImageUrl, request.log);
    }
    return { course: await loadCourseDetail(app.db, updated) };
  }

  app.post(
    '/courses/:id/cover',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Start uploading a cover image for a course',
        description:
          'PUT the whole image to `uploadUrl` with the same Content-Type, then call /cover/complete.',
        params: coverParamsSchema,
        body: createCoverUploadRequestSchema,
        response: { 200: createCoverUploadResponseSchema },
      },
    },
    async (request) => {
      const course = await managedCourse(request, request.params.id);
      const { contentType, sizeBytes } = request.body;
      const coverId = randomUUID();
      const uploadUrl = await app.storage.presignPut(
        coverFileKey(course.id, coverId),
        contentType,
        sizeBytes,
        COVER_UPLOAD_TTL_SECONDS,
      );
      return { coverId, uploadUrl };
    },
  );

  app.post(
    '/courses/:id/cover/complete',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Finish a cover upload and make it the course cover',
        description: 'The previous uploaded cover, if any, is deleted.',
        params: coverParamsSchema,
        body: completeCoverUploadRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const { coverId } = request.body;
      const course = await managedCourse(request, request.params.id);
      const key = coverFileKey(course.id, coverId);
      // the upload address is signed with the announced size, so any stored file is within the limit;
      // checking again keeps a hand-made PUT with a long-lived address from sneaking past
      const stored = await app.storage.sizeOf(key);
      if (stored === null) throw badRequest('The cover was not uploaded');
      if (stored > COVER_MAX_BYTES) {
        await app.storage.deleteObject(key);
        throw badRequest(`Covers can be at most ${COVER_MAX_BYTES} bytes`);
      }
      return changeCover(request, course, uploadedCoverPath(course.id, coverId));
    },
  );

  app.delete(
    '/courses/:id/cover',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['files'],
        summary: 'Remove the cover of a course',
        description: 'The course goes back to its generated cover.',
        params: coverParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => changeCover(request, await managedCourse(request, request.params.id), null),
  );

  app.get(
    '/courses/:id/cover/:coverId',
    {
      // public on purpose: an <img> cannot renew an expired session, and a cover is not a secret
      schema: {
        tags: ['files'],
        summary: 'Cover image of a course',
        description:
          'Answers with a redirect to a short-lived address of the image. Only the current cover ' +
          'answers; a replaced one is gone.',
        params: coverFileParamsSchema,
      },
    },
    async (request, reply) => {
      const { id, coverId } = request.params;
      const [course] = await app.db
        .select({ coverImageUrl: courses.coverImageUrl })
        .from(courses)
        .where(eq(courses.id, id));
      if (course?.coverImageUrl !== uploadedCoverPath(id, coverId))
        throw notFound('Cover not found');

      const address = await app.storage.presignGet(
        coverFileKey(id, coverId),
        COVER_READ_TTL_SECONDS,
      );
      // cached for less than the address lives, so a cached redirect never points at an expired one
      return reply
        .header('cache-control', `public, max-age=${COVER_READ_TTL_SECONDS / 2}`)
        .redirect(address, 302);
    },
  );
};
