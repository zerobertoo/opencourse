import {
  courseResponseSchema,
  createLessonResponseSchema,
  createModuleResponseSchema,
} from '@opencourse/shared';
import type { CurriculumService } from '../curriculum';
import { ServiceError } from '../errors';
import type { ApiClient } from './client';

const UPLOADS_UNAVAILABLE = 'File uploads need the storage adapter, which is not available yet';

/**
 * CurriculumService backed by the real API. Files (attachments and local video) need the storage
 * adapter of a later milestone, so those operations refuse without calling the API.
 */
export function createApiCurriculumService(client: ApiClient): CurriculumService {
  const readCourse = async (method: 'PATCH' | 'DELETE' | 'PUT', path: string, body?: unknown) =>
    (await client.request(method, path, { body, schema: courseResponseSchema })).course;
  const unavailable = (): Promise<never> =>
    Promise.reject(new ServiceError('unavailable', UPLOADS_UNAVAILABLE));
  const moduleUrl = (moduleId: string) => `/modules/${encodeURIComponent(moduleId)}`;
  const lessonUrl = (lessonId: string) => `/lessons/${encodeURIComponent(lessonId)}`;

  return {
    createModule: ({ courseId, title, locale }) =>
      client.request('POST', `/courses/${encodeURIComponent(courseId)}/modules`, {
        body: { title, locale },
        schema: createModuleResponseSchema,
      }),

    updateModule: (moduleId, input) => readCourse('PATCH', moduleUrl(moduleId), input),

    deleteModule: (moduleId) => readCourse('DELETE', moduleUrl(moduleId)),

    createLesson: ({ moduleId, type, title, locale }) =>
      client.request('POST', `${moduleUrl(moduleId)}/lessons`, {
        body: { type, title, locale },
        schema: createLessonResponseSchema,
      }),

    updateLesson: (lessonId, input) => readCourse('PATCH', lessonUrl(lessonId), input),

    deleteLesson: (lessonId) => readCourse('DELETE', lessonUrl(lessonId)),

    addLessonAttachments: unavailable,

    removeLessonAttachment: unavailable,

    setLessonVideo: (lessonId, source) =>
      source.provider === 'external'
        ? readCourse('PATCH', lessonUrl(lessonId), { video: { url: source.url } })
        : unavailable(),

    removeLessonVideo: (lessonId) => readCourse('PATCH', lessonUrl(lessonId), { video: null }),

    reorder: (courseId, layout) =>
      readCourse('PUT', `/courses/${encodeURIComponent(courseId)}/curriculum`, { modules: layout }),
  };
}
