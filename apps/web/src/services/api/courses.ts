import {
  courseResponseSchema,
  createCoverUploadResponseSchema,
  listCoursesResponseSchema,
} from '@opencourse/shared';
import type { CourseService } from '../courses';
import { ServiceError } from '../errors';
import type { ApiClient } from './client';

/** CourseService backed by the real API. Cover images go straight to the storage. */
export function createApiCourseService(
  client: ApiClient,
  // injectable for tests
  sendFile: typeof fetch = (...args) => fetch(...args),
): CourseService {
  const readCourse = async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ) => (await client.request(method, path, { body, schema: courseResponseSchema })).course;

  return {
    async list(filters = {}) {
      const { courses } = await client.request('GET', '/courses', {
        query: {
          scope: filters.scope,
          status: filters.status,
          // the API refuses an empty search or one over 100 characters
          search: filters.search?.trim().slice(0, 100) || undefined,
        },
        schema: listCoursesResponseSchema,
      });
      // the API has no instructor filter: the managed scope already narrows instructors to their own
      return filters.instructorId
        ? courses.filter((course) => course.instructorId === filters.instructorId)
        : courses;
    },

    getBySlug: (slug) => readCourse('GET', `/courses/by-slug/${encodeURIComponent(slug)}`),

    getById: (id) => readCourse('GET', `/courses/${encodeURIComponent(id)}`),

    create: (input) =>
      readCourse('POST', '/courses', {
        title: input.title,
        description: input.description ?? '',
        defaultLocale: input.defaultLocale,
      }),

    update: (id, input) => readCourse('PATCH', `/courses/${encodeURIComponent(id)}`, input),

    async uploadCover(id, file) {
      const coverUrl = `/courses/${encodeURIComponent(id)}/cover`;
      const started = await client.request('POST', coverUrl, {
        body: { contentType: file.type, sizeBytes: file.size },
        schema: createCoverUploadResponseSchema,
      });
      let response: Response;
      try {
        response = await sendFile(started.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type },
          body: file,
        });
      } catch {
        throw new ServiceError('unavailable', 'Could not reach the storage to upload the image');
      }
      if (!response.ok) throw new ServiceError('unavailable', 'The image upload failed');
      return (
        await client.request('POST', `${coverUrl}/complete`, {
          body: { coverId: started.coverId },
          schema: courseResponseSchema,
        })
      ).course;
    },

    removeCover: (id) => readCourse('DELETE', `/courses/${encodeURIComponent(id)}/cover`),
  };
}
