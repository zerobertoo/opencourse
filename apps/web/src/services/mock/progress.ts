import {
  flattenLessons,
  getUnlockedLessonIds,
  scoreQuiz,
  type Lesson,
  type Progress,
} from '@opencourse/shared';
import { ServiceError } from '../errors';
import type { ProgressService } from '../progress';
import type { MockContext } from './context';
import {
  canReadCourse,
  findCourseById,
  findLesson,
  getCompletedLessonIds,
  issueCertificateIfComplete,
} from './helpers';
import { clone } from './store';

export function createMockProgressService(context: MockContext): ProgressService {
  const { store } = context;

  /** Resolve a aula garantindo que o usuário atual pode estudá-la agora. */
  function requireAccessibleLesson(lessonId: string) {
    const user = context.requireUser();
    const { course, lesson } = findLesson(store.db, lessonId);
    if (!canReadCourse(store.db, user, course, context.now())) {
      throw new ServiceError('forbidden', 'No active grant for this course');
    }
    const completed = getCompletedLessonIds(store.db, user.id, course);
    if (!getUnlockedLessonIds(course, completed).has(lessonId)) {
      throw new ServiceError('forbidden', 'Complete the previous lessons first');
    }
    return { user, course, lesson };
  }

  /** Cria ou atualiza o registro de progresso e devolve o registro salvo. */
  function upsertProgress(
    userId: string,
    lessonId: string,
    change: (entry: Progress) => void,
  ): Progress {
    return store.mutate((db) => {
      let entry = db.progress.find((item) => item.userId === userId && item.lessonId === lessonId);
      if (!entry) {
        entry = { userId, lessonId, completed: false, videoPositionSeconds: 0, updatedAt: '' };
        db.progress.push(entry);
      }
      change(entry);
      entry.updatedAt = context.now().toISOString();
      return clone(entry);
    });
  }

  function markCompleted(userId: string, lesson: Lesson, courseId: string): Progress {
    const entry = upsertProgress(userId, lesson.id, (item) => {
      item.completed = true;
    });
    issueCertificateIfComplete(context, userId, findCourseById(store.db, courseId));
    return entry;
  }

  return {
    getCourseProgress: (courseId) =>
      context.run('progress.getCourseProgress', () => {
        const user = context.requireUser();
        const course = findCourseById(store.db, courseId);
        const lessonIds = new Set(flattenLessons(course).map((lesson) => lesson.id));
        return clone(
          store.db.progress.filter(
            (entry) => entry.userId === user.id && lessonIds.has(entry.lessonId),
          ),
        );
      }),

    setLessonCompleted: (lessonId, completed) =>
      context.run('progress.setLessonCompleted', () => {
        const { user, course, lesson } = requireAccessibleLesson(lessonId);
        if (completed) return markCompleted(user.id, lesson, course.id);
        return upsertProgress(user.id, lessonId, (entry) => {
          entry.completed = false;
        });
      }),

    saveVideoPosition: (lessonId, positionSeconds) =>
      context.run('progress.saveVideoPosition', () => {
        const { user, lesson } = requireAccessibleLesson(lessonId);
        if (lesson.type !== 'video') {
          throw new ServiceError('validation', 'Only video lessons have a playback position');
        }
        const position = Math.max(0, Math.min(positionSeconds, lesson.durationSeconds));
        return upsertProgress(user.id, lessonId, (entry) => {
          entry.videoPositionSeconds = position;
        });
      }),

    submitQuizAttempt: (lessonId, answers) =>
      context.run('progress.submitQuizAttempt', () => {
        const { user, course, lesson } = requireAccessibleLesson(lessonId);
        if (lesson.type !== 'quiz') {
          throw new ServiceError('validation', 'This lesson is not a quiz');
        }

        const score = scoreQuiz(lesson.quiz, answers);
        const attempt = {
          id: store.nextId('attempt'),
          userId: user.id,
          lessonId,
          answers: { ...answers },
          score: score.score,
          passed: score.passed,
          createdAt: context.now().toISOString(),
        };
        store.mutate((db) => db.quizAttempts.push(attempt));
        if (score.passed) markCompleted(user.id, lesson, course.id);
        return clone({ attempt, score });
      }),

    listQuizAttempts: (lessonId) =>
      context.run('progress.listQuizAttempts', () => {
        const user = context.requireUser();
        findLesson(store.db, lessonId);
        return clone(
          store.db.quizAttempts
            .filter((attempt) => attempt.userId === user.id && attempt.lessonId === lessonId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        );
      }),
  };
}
