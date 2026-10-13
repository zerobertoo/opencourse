import {
  completeAttachmentResponseSchema,
  completeVideoUploadResponseSchema,
  courseResponseSchema,
  createAttachmentResponseSchema,
  createLessonResponseSchema,
  createModuleResponseSchema,
  createVideoUploadResponseSchema,
  type CourseDetail,
} from '@opencourse/shared';
import type { AttachmentUpload, CurriculumService, SetLessonVideoOptions } from '../curriculum';
import { ServiceError } from '../errors';
import type { ApiClient } from './client';

/**
 * CurriculumService backed by the real API. Video files and attachments go straight to the
 * storage (video in slices, attachments in one request); captions travel as text through the API.
 */
export function createApiCurriculumService(
  client: ApiClient,
  // injectable for tests
  sendPart: typeof fetch = (...args) => fetch(...args),
): CurriculumService {
  const readCourse = async (method: 'PATCH' | 'DELETE' | 'PUT', path: string, body?: unknown) =>
    (await client.request(method, path, { body, schema: courseResponseSchema })).course;
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

  /** Asks for an address, PUTs the whole file to the storage, then confirms it. */
  async function uploadAttachment(lessonId: string, file: File): Promise<CourseDetail> {
    const contentType = file.type || 'application/octet-stream';
    const started = await client.request('POST', `${lessonUrl(lessonId)}/attachments`, {
      body: { filename: file.name, contentType, sizeBytes: file.size },
      schema: createAttachmentResponseSchema,
    });
    let response: Response;
    try {
      response = await sendPart(started.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body: file,
      });
    } catch {
      throw new ServiceError('unavailable', 'Could not reach the storage to upload the file');
    }
    if (!response.ok) throw new ServiceError('unavailable', 'The file upload failed');
    const completed = await client.request(
      'POST',
      `${lessonUrl(lessonId)}/attachments/${encodeURIComponent(started.attachmentId)}/complete`,
      { schema: completeAttachmentResponseSchema },
    );
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

    async addLessonAttachments(lessonId, uploads: AttachmentUpload[]) {
      let course: CourseDetail | undefined;
      for (const upload of uploads) {
        if (!upload.file) throw new ServiceError('validation', 'There is no file to upload');
        course = await uploadAttachment(lessonId, upload.file);
      }
      if (!course) throw new ServiceError('validation', 'There is no file to upload');
      return course;
    },

    removeLessonAttachment: (lessonId, attachmentId) =>
      readCourse(
        'DELETE',
        `${lessonUrl(lessonId)}/attachments/${encodeURIComponent(attachmentId)}`,
      ),

    setLessonCaption: async (lessonId, locale, file) =>
      (
        await client.request(
          'PUT',
          `${lessonUrl(lessonId)}/captions/${encodeURIComponent(locale)}`,
          {
            body: await file.text(),
            contentType: 'text/plain',
            schema: courseResponseSchema,
          },
        )
      ).course,

    removeLessonCaption: (lessonId, locale) =>
      readCourse('DELETE', `${lessonUrl(lessonId)}/captions/${encodeURIComponent(locale)}`),

    setLessonVideo: (lessonId, source, options = {}) =>
      source.provider === 'external'
        ? readCourse('PATCH', lessonUrl(lessonId), { video: { url: source.url } })
        : uploadVideoFile(lessonId, source.file, options),

    removeLessonVideo: (lessonId) => readCourse('PATCH', lessonUrl(lessonId), { video: null }),

    reorder: (courseId, layout) =>
      readCourse('PUT', `/courses/${encodeURIComponent(courseId)}/curriculum`, { modules: layout }),
  };
}
