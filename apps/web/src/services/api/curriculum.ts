import {
  completeVideoUploadResponseSchema,
  courseResponseSchema,
  createLessonResponseSchema,
  createModuleResponseSchema,
  createVideoUploadResponseSchema,
  type CourseDetail,
} from '@opencourse/shared';
import type { CurriculumService, SetLessonVideoOptions } from '../curriculum';
import { ServiceError } from '../errors';
import type { ApiClient } from './client';

const UPLOADS_UNAVAILABLE = 'Attachments need a later milestone and are not available yet';

/**
 * CurriculumService backed by the real API. Lesson attachments wait for a later milestone, so
 * they refuse without calling the API; video files go straight to the storage in slices.
 */
export function createApiCurriculumService(
  client: ApiClient,
  // injectable for tests
  sendPart: typeof fetch = (...args) => fetch(...args),
): CurriculumService {
  const readCourse = async (method: 'PATCH' | 'DELETE' | 'PUT', path: string, body?: unknown) =>
    (await client.request(method, path, { body, schema: courseResponseSchema })).course;
  const unavailable = (): Promise<never> =>
    Promise.reject(new ServiceError('unavailable', UPLOADS_UNAVAILABLE));
  const moduleUrl = (moduleId: string) => `/modules/${encodeURIComponent(moduleId)}`;
  const lessonUrl = (lessonId: string) => `/lessons/${encodeURIComponent(lessonId)}`;

  /** Asks for upload addresses, PUTs each slice of the file to the storage, then reports the ETags. */
  async function uploadVideoFile(
    lessonId: string,
    file: File,
    { onProgress }: SetLessonVideoOptions,
  ): Promise<CourseDetail> {
    const upload = await client.request('POST', `${lessonUrl(lessonId)}/video/upload`, {
      // browsers leave the type empty for some containers (.mkv); the worker probes the content anyway
      body: { filename: file.name, contentType: file.type || 'video/mp4', sizeBytes: file.size },
      schema: createVideoUploadResponseSchema,
    });
    const parts: Array<{ partNumber: number; etag: string }> = [];
    for (const part of upload.parts) {
      const start = (part.partNumber - 1) * upload.partSizeBytes;
      let response: Response;
      try {
        response = await sendPart(part.url, {
          method: 'PUT',
          body: file.slice(start, start + upload.partSizeBytes),
        });
      } catch {
        throw new ServiceError('unavailable', 'Could not reach the storage to upload the video');
      }
      const etag = response.headers.get('etag');
      // no ETag usually means the storage did not allow this origin to read it (CORS)
      if (!response.ok || !etag) throw new ServiceError('unavailable', 'The video upload failed');
      parts.push({ partNumber: part.partNumber, etag });
      onProgress?.(parts.length / upload.parts.length);
    }
    const completed = await client.request('POST', `${lessonUrl(lessonId)}/video/complete`, {
      body: { parts },
      schema: completeVideoUploadResponseSchema,
    });
    return completed.course;
  }

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

    setLessonVideo: (lessonId, source, options = {}) =>
      source.provider === 'external'
        ? readCourse('PATCH', lessonUrl(lessonId), { video: { url: source.url } })
        : uploadVideoFile(lessonId, source.file, options),

    removeLessonVideo: (lessonId) => readCourse('PATCH', lessonUrl(lessonId), { video: null }),

    reorder: (courseId, layout) =>
      readCourse('PUT', `/courses/${encodeURIComponent(courseId)}/curriculum`, { modules: layout }),
  };
}
