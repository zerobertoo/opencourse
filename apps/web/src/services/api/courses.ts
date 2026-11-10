import {
  courseResponseSchema,
  createBannerUploadResponseSchema,
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

    uploadCover: (id, file) => uploadImage(id, 'cover', file),
    removeCover: (id) => readCourse('DELETE', `/courses/${encodeURIComponent(id)}/cover`),
    uploadBanner: (id, file) => uploadImage(id, 'banner', file),
    removeBanner: (id) => readCourse('DELETE', `/courses/${encodeURIComponent(id)}/banner`),
  };

  /** Covers and banners share the flow: ask for an address, PUT the file, report it done. */
  async function uploadImage(id: string, kind: 'cover' | 'banner', file: File) {
    const url = `/courses/${encodeURIComponent(id)}/${kind}`;
    const started =
      kind === 'cover'
        ? await client.request('POST', url, {
            body: { contentType: file.type, sizeBytes: file.size },
            schema: createCoverUploadResponseSchema,
          })
        : await client.request('POST', url, {
            body: { contentType: file.type, sizeBytes: file.size },
            schema: createBannerUploadResponseSchema,
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
    const done =
      'coverId' in started ? { coverId: started.coverId } : { bannerId: started.bannerId };
    return (
      await client.request('POST', `${url}/complete`, {
        body: done,
        schema: courseResponseSchema,
      })
    ).course;
  }
}
