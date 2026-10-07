import { flattenLessons } from '@opencourse/shared';
import type {
  ContinueLearningItem,
  CourseStudent,
  EnrolledCourse,
  EnrollmentService,
} from '../enrollments';
import { ServiceError } from '../errors';
import type { MockContext } from './context';
import {
  canManageCourse,
  canReadCourse,
  findActiveGrant,
  findCourseById,
  findUserById,
  getLastActivityAt,
  summarizeUserCourse,
  withEffectiveStatus,
} from './helpers';
import { clone } from './store';

export function createMockEnrollmentService(context: MockContext): EnrollmentService {
  const { store } = context;

  /** Courses with an active grant for the user, from most recent to oldest. */
  function enrolledCourses(userId: string): EnrolledCourse[] {
    const db = store.db;
    const now = context.now();
    return db.courses
      .flatMap((course) => {
        if (course.status === 'draft') return [];
        const grant = findActiveGrant(db, userId, course.id, now);
        if (!grant) return [];
        return [
          {
            course,
            grant,
            progress: summarizeUserCourse(db, userId, course),
            lastActivityAt: getLastActivityAt(db, userId, course),
          },
        ];
      })
      .sort((a, b) =>
        (b.lastActivityAt ?? b.grant.createdAt).localeCompare(
          a.lastActivityAt ?? a.grant.createdAt,
        ),
      );
  }

  return {
    listMyCourses: () =>
      context.run('enrollments.listMyCourses', () => {
        const user = context.requireUser();
        return clone(enrolledCourses(user.id));
      }),

    getContinueLearning: () =>
      context.run('enrollments.getContinueLearning', () => {
        const user = context.requireUser();
        const inProgress = enrolledCourses(user.id).find(
          (entry) => entry.lastActivityAt !== null && !entry.progress.isComplete,
        );
        if (!inProgress?.progress.nextLessonId) return null;

        const lesson = flattenLessons(inProgress.course).find(
          (candidate) => candidate.id === inProgress.progress.nextLessonId,
        );
        if (!lesson) return null;

        const saved = store.db.progress.find(
          (entry) => entry.userId === user.id && entry.lessonId === lesson.id,
        );
        const item: ContinueLearningItem = {
          course: inProgress.course,
          lesson,
          progress: inProgress.progress,
          videoPositionSeconds: saved?.videoPositionSeconds ?? 0,
        };
        return clone(item);
      }),

    canAccess: (courseId) =>
      context.run('enrollments.canAccess', () => {
        const user = context.requireUser();
        return canReadCourse(store.db, user, findCourseById(store.db, courseId), context.now());
      }),

    listCourseStudents: (courseId) =>
      context.run('enrollments.listCourseStudents', () => {
        const user = context.requireRole('instructor', 'admin');
        const db = store.db;
        const course = findCourseById(db, courseId);
        if (!canManageCourse(user, course)) {
          throw new ServiceError(
            'forbidden',
            'Only the course instructor or an admin can list students',
          );
        }

        const now = context.now();
        const students: CourseStudent[] = [];
        for (const grant of db.grants.filter((candidate) => candidate.courseId === courseId)) {
          // a student with several grants shows up once, with the most relevant one
          if (students.some((student) => student.user.id === grant.userId)) continue;
          const effective =
            findActiveGrant(db, grant.userId, courseId, now) ?? withEffectiveStatus(grant, now);
          students.push({
            user: findUserById(db, grant.userId),
            grant: effective,
            progress: summarizeUserCourse(db, grant.userId, course),
            lastActivityAt: getLastActivityAt(db, grant.userId, course),
          });
        }
        return clone(students);
      }),
  };
}
