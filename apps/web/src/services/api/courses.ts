import { courseResponseSchema, listCoursesResponseSchema } from '@opencourse/shared';
import type { CourseService } from '../courses';
import type { ApiClient } from './client';

/** CourseService backed by the real API. */
export function createApiCourseService(client: ApiClient): CourseService {
  const readCourse = async (method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) =>
    (await client.request(method, path, { body, schema: courseResponseSchema })).course;

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
  };
}
