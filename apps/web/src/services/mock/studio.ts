import type { CourseStats, StudioDashboard, StudioService } from '../studio';
import type { MockContext } from './context';
import { findActiveGrant, summarizeUserCourse } from './helpers';
import { clone } from './store';

export function createMockStudioService(context: MockContext): StudioService {
  const { store } = context;

  return {
    getDashboard: () =>
      context.run('studio.getDashboard', () => {
        const user = context.requireRole('instructor', 'admin');
        const db = store.db;
        const now = context.now();
        const managed = db.courses.filter(
          (course) => user.role === 'admin' || course.instructorId === user.id,
        );

        const distinctStudents = new Set<string>();
        let enrollments = 0;
        let completed = 0;
        const courses: CourseStats[] = managed.map((course) => {
          // deactivated users do not count as students
          const studentIds = db.users
            .filter((candidate) => candidate.active)
            .map((candidate) => candidate.id)
            .filter((userId) => findActiveGrant(db, userId, course.id, now) !== undefined);
          const completedStudents = studentIds.filter(
            (userId) => summarizeUserCourse(db, userId, course).isComplete,
          ).length;

          for (const userId of studentIds) distinctStudents.add(userId);
          enrollments += studentIds.length;
          completed += completedStudents;
          return {
            courseId: course.id,
            students: studentIds.length,
            completedStudents,
            completionRate: studentIds.length === 0 ? 0 : completedStudents / studentIds.length,
          };
        });

        const dashboard: StudioDashboard = {
          activeStudents: distinctStudents.size,
          publishedCourses: managed.filter((course) => course.status === 'published').length,
          completionRate: enrollments === 0 ? 0 : completed / enrollments,
          courses,
        };
        return clone(dashboard);
      }),
  };
}
