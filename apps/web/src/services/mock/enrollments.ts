import {
  flattenLessons,
  getCourseSummaryStats,
  type CourseDetail,
  type EnrolledCourseItem,
  type User,
} from '@opencourse/shared';
import type { ContinueLearningItem, CourseStudent, EnrollmentService } from '../enrollments';
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

/** What a manager sees of a student. */
function toStudentUser(user: User) {
  return { id: user.id, name: user.name, email: user.email };
}

export function createMockEnrollmentService(context: MockContext): EnrollmentService {
  const { store } = context;

  /** Courses with an active grant for the user, from most recent to oldest. */
  function enrolledCourses(
    userId: string,
  ): Array<{ detail: CourseDetail; item: EnrolledCourseItem }> {
    const db = store.db;
    const now = context.now();
    return db.courses
      .flatMap((detail) => {
        if (detail.status === 'draft') return [];
        const grant = findActiveGrant(db, userId, detail.id, now);
        if (!grant) return [];
        const { modules, instructor, ...summary } = detail;
        void [modules, instructor];
        const item: EnrolledCourseItem = {
          course: { ...summary, ...getCourseSummaryStats(detail), myGrant: grant },
          grant,
          progress: summarizeUserCourse(db, userId, detail),
          lastActivityAt: getLastActivityAt(db, userId, detail),
        };
        return [{ detail, item }];
      })
      .sort((a, b) =>
        (b.item.lastActivityAt ?? b.item.grant.createdAt).localeCompare(
          a.item.lastActivityAt ?? a.item.grant.createdAt,
        ),
      );
  }

  return {
    listMyCourses: () =>
      context.run('enrollments.listMyCourses', () => {
        const user = context.requireUser();
        return clone(enrolledCourses(user.id).map(({ item }) => item));
      }),

    getContinueLearning: () =>
      context.run('enrollments.getContinueLearning', () => {
        const user = context.requireUser();
        const inProgress = enrolledCourses(user.id).find(
          ({ item }) => item.lastActivityAt !== null && !item.progress.isComplete,
        );
        if (!inProgress?.item.progress.nextLessonId) return null;

        const lesson = flattenLessons(inProgress.detail).find(
          (candidate) => candidate.id === inProgress.item.progress.nextLessonId,
        );
        if (!lesson) return null;

        const saved = store.db.progress.find(
          (entry) => entry.userId === user.id && entry.lessonId === lesson.id,
        );
        const item: ContinueLearningItem = {
          course: inProgress.item.course,
          lesson: {
            id: lesson.id,
            type: lesson.type,
            durationSeconds: lesson.durationSeconds,
            translations: lesson.translations.map(({ locale, title }) => ({ locale, title })),
          },
          progress: inProgress.item.progress,
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
            user: toStudentUser(findUserById(db, grant.userId)),
            grant: effective,
            progress: summarizeUserCourse(db, grant.userId, course),
            lastActivityAt: getLastActivityAt(db, grant.userId, course),
          });
        }
        return clone(students);
      }),
  };
}
