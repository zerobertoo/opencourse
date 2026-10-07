import { studioMetricsSchema, type StudioMetrics } from '@opencourse/shared';
import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, grants, users } from '../../db/schema';
import { loadCourseDetails } from '../courses/detail';
import { loadStudentProgress, progressOf, summarizeStudent } from '../progress/stats';

export const studioRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/studio/metrics',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['studio'],
        summary: 'Dashboard metrics of the courses the caller manages',
        description:
          'Admins see every course, instructors their own. A student counts when their grant is ' +
          'active; an enrollment is completed when every current lesson is.',
        response: { 200: studioMetricsSchema },
      },
    },
    async (request): Promise<StudioMetrics> => {
      const { user } = request.auth!;
      const now = new Date();
      const rows = await app.db
        .select()
        .from(courses)
        .where(user.role === 'admin' ? undefined : eq(courses.instructorId, user.id));
      if (rows.length === 0) {
        return { activeStudents: 0, publishedCourses: 0, completionRate: 0, courses: [] };
      }

      const courseIds = rows.map((row) => row.id);
      const active = await app.db
        .select({ courseId: grants.courseId, userId: grants.userId })
        .from(grants)
        // deactivated people cannot study, so they are not students
        .innerJoin(users, and(eq(users.id, grants.userId), eq(users.active, true)))
        .where(
          and(
            inArray(grants.courseId, courseIds),
            isNull(grants.revokedAt),
            or(isNull(grants.expiresAt), gt(grants.expiresAt, now)),
          ),
        );
      const studentIds = [...new Set(active.map((grant) => grant.userId))];
      // ponytail: whole curricula and every record in memory; per-course SQL counts if instances grow large
      const details = await loadCourseDetails(app.db, rows);
      const all = await loadStudentProgress(app.db, courseIds, studentIds);

      const perCourse = details.map((detail) => {
        const students = active.filter((grant) => grant.courseId === detail.id);
        const completedStudents = students.filter(
          (grant) => summarizeStudent(detail, progressOf(all, detail.id, grant.userId)).isComplete,
        ).length;
        return {
          courseId: detail.id,
          students: students.length,
          completedStudents,
          completionRate: students.length === 0 ? 0 : completedStudents / students.length,
        };
      });
      const enrollments = active.length;
      const completed = perCourse.reduce((total, course) => total + course.completedStudents, 0);
      return {
        activeStudents: studentIds.length,
        publishedCourses: rows.filter((row) => row.status === 'published').length,
        completionRate: enrollments === 0 ? 0 : completed / enrollments,
        courses: perCourse,
      };
    },
  );
};
