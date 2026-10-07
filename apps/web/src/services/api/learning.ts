import {
  continueLearningResponseSchema,
  courseProgressResponseSchema,
  courseStudentsResponseSchema,
  listQuizAttemptsResponseSchema,
  myCoursesResponseSchema,
  noteResponseSchema,
  progressResponseSchema,
  quizSubmissionResponseSchema,
  studioMetricsSchema,
} from '@opencourse/shared';
import type { EnrollmentService } from '../enrollments';
import { isServiceError } from '../errors';
import type { NoteService } from '../notes';
import type { ProgressService } from '../progress';
import type { StudioService } from '../studio';
import type { ApiClient } from './client';

const encode = encodeURIComponent;

/** ProgressService backed by the real API. The server grades quizzes and enforces the lesson order. */
export function createApiProgressService(client: ApiClient): ProgressService {
  const writeProgress = async (lessonId: string, body: object) =>
    (
      await client.request('PUT', `/lessons/${encode(lessonId)}/progress`, {
        body,
        schema: progressResponseSchema,
      })
    ).progress;

  return {
    async getCourseProgress(courseId) {
      const { progress } = await client.request('GET', `/courses/${encode(courseId)}/progress`, {
        schema: courseProgressResponseSchema,
      });
      return progress;
    },

    setLessonCompleted: (lessonId, completed) => writeProgress(lessonId, { completed }),

    // the API stores whole seconds
    saveVideoPosition: (lessonId, positionSeconds) =>
      writeProgress(lessonId, { videoPositionSeconds: Math.max(0, Math.round(positionSeconds)) }),

    submitQuizAttempt: (lessonId, answers) =>
      client.request('POST', `/quizzes/${encode(lessonId)}/attempts`, {
        body: { answers },
        schema: quizSubmissionResponseSchema,
      }),

    async listQuizAttempts(lessonId) {
      const { attempts } = await client.request('GET', `/quizzes/${encode(lessonId)}/attempts`, {
        schema: listQuizAttemptsResponseSchema,
      });
      return attempts;
    },
  };
}

/** EnrollmentService backed by the real API. */
export function createApiEnrollmentService(client: ApiClient): EnrollmentService {
  return {
    async listMyCourses() {
      const { courses } = await client.request('GET', '/me/courses', {
        schema: myCoursesResponseSchema,
      });
      return courses;
    },

    async getContinueLearning() {
      const { item } = await client.request('GET', '/me/continue-learning', {
        schema: continueLearningResponseSchema,
      });
      return item;
    },

    // the progress route answers 200 only to people who can read the course, and it is tiny
    async canAccess(courseId) {
      try {
        await client.request('GET', `/courses/${encode(courseId)}/progress`, {
          schema: courseProgressResponseSchema,
        });
        return true;
      } catch (error) {
        if (isServiceError(error) && (error.code === 'forbidden' || error.code === 'not_found')) {
          return false;
        }
        throw error;
      }
    },

    async listCourseStudents(courseId) {
      const { students } = await client.request('GET', `/courses/${encode(courseId)}/students`, {
        schema: courseStudentsResponseSchema,
      });
      return students;
    },
  };
}

/** NoteService backed by the real API. */
export function createApiNoteService(client: ApiClient): NoteService {
  return {
    async getLessonNote(lessonId) {
      const { note } = await client.request('GET', `/lessons/${encode(lessonId)}/note`, {
        schema: noteResponseSchema,
      });
      return note;
    },

    async saveLessonNote(lessonId, content) {
      const { note } = await client.request('PUT', `/lessons/${encode(lessonId)}/note`, {
        body: { content },
        schema: noteResponseSchema,
      });
      return note;
    },
  };
}

/** StudioService backed by the real API. */
export function createApiStudioService(client: ApiClient): StudioService {
  return {
    getDashboard: () => client.request('GET', '/studio/metrics', { schema: studioMetricsSchema }),
  };
}
