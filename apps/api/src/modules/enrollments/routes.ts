import {
  continueLearningResponseSchema,
  courseIdParamsSchema,
  courseStudentsResponseSchema,
  flattenLessons,
  myCoursesResponseSchema,
  type ContinueLearningResponseItem,
  type CourseStudentItem,
  type EnrolledCourseItem,
} from '@opencourse/shared';
import { and, desc, eq, gt, isNull, ne, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, grants, users } from '../../db/schema';
import { requireManagedCourse } from '../courses/access';
import { loadCourseDetail, loadCourseDetails } from '../courses/detail';
import { toListedCourse } from '../courses/listed';
import { toGrant } from '../grants/mappers';
import { loadStudentProgress, progressOf, summarizeStudent } from '../progress/stats';

export const enrollmentRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Courses the user may open now (active grant, any status but draft), most recent first: by the
   * later of the last activity and the grant date, so a fresh grant shows up on top.
   */
  async function loadEnrollments(userId: string, now: Date) {
    const rows = await app.db
      .select({ course: courses, grant: grants })
      .from(grants)
      .innerJoin(courses, eq(courses.id, grants.courseId))
      .where(
        and(
          eq(grants.userId, userId),
          isNull(grants.revokedAt),
          or(isNull(grants.expiresAt), gt(grants.expiresAt, now)),
          ne(courses.status, 'draft'),
        ),
      );
    if (rows.length === 0) return [];

    const details = await loadCourseDetails(
      app.db,
      rows.map((row) => row.course),
    );
    const all = await loadStudentProgress(
      app.db,
      details.map((detail) => detail.id),
      [userId],
    );
    return details
      .map((detail) => {
        const grant = toGrant(rows.find((row) => row.course.id === detail.id)!.grant, now);
        const entry = progressOf(all, detail.id, userId);
        const item: EnrolledCourseItem = {
          course: toListedCourse(detail, grant),
          grant,
          progress: summarizeStudent(detail, entry),
          lastActivityAt: entry.lastActivityAt?.toISOString() ?? null,
        };
        return { item, detail, positions: entry.positions };
      })
      .sort((a, b) =>
        (b.item.lastActivityAt ?? b.item.grant.createdAt).localeCompare(
          a.item.lastActivityAt ?? a.item.grant.createdAt,
        ),
      );
  }

  app.get(
    '/me/courses',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Courses the user can open, with progress',
        description:
          'Active grants only; revoked and expired ones hide the course and keep the progress. ' +
          'Archived courses with an active grant are listed, drafts never.',
        response: { 200: myCoursesResponseSchema },
      },
    },
    async (request) => {
      const enrollments = await loadEnrollments(request.auth!.user.id, new Date());
      return { courses: enrollments.map((enrollment) => enrollment.item) };
    },
  );

  app.get(
    '/me/continue-learning',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['me'],
        summary: 'Where to pick up: next lesson of the course studied most recently',
        description: 'Null when nothing was started, or every started course is finished.',
        response: { 200: continueLearningResponseSchema },
      },
    },
    async (request) => {
      const enrollments = await loadEnrollments(request.auth!.user.id, new Date());
      const current = enrollments.find(
        // a finished course has no next lesson, so this also skips it
        ({ item }) => item.lastActivityAt !== null && item.progress.nextLessonId,
      );
      if (!current) return { item: null };

      const lesson = flattenLessons(current.detail).find(
        (candidate) => candidate.id === current.item.progress.nextLessonId,
      );
      if (!lesson) return { item: null };
      const item: ContinueLearningResponseItem = {
        course: current.item.course,
        lesson: {
          id: lesson.id,
          type: lesson.type,
          durationSeconds: lesson.durationSeconds,
          translations: lesson.translations.map(({ locale, title }) => ({ locale, title })),
        },
        progress: current.item.progress,
        videoPositionSeconds: current.positions.get(lesson.id) ?? 0,
      };
      return { item };
    },
  );

  app.get(
    '/courses/:id/students',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['courses'],
        summary: 'Students of a course with their progress',
        description:
          'Course instructor or admin. One entry per person: the open grant when there is one, ' +
          'else the latest revoked one.',
        params: courseIdParamsSchema,
        response: { 200: courseStudentsResponseSchema },
      },
    },
    async (request) => {
      const [existing] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, request.params.id));
      const course = await requireManagedCourse(app.db, request.auth!.user, existing);
      const now = new Date();

      const rows = await app.db
        .select({ grant: grants, user: users })
        .from(grants)
        .innerJoin(users, eq(users.id, grants.userId))
        .where(eq(grants.courseId, course.id))
        // open grants first, then the newest: the first row of each person is the one to show
        .orderBy(desc(isNull(grants.revokedAt)), desc(grants.createdAt), desc(grants.id));
      const seen = new Set<string>();
      const shown = rows.filter(({ user }) => !seen.has(user.id) && seen.add(user.id));
      if (shown.length === 0) return { students: [] };

      const detail = await loadCourseDetail(app.db, course);
      const all = await loadStudentProgress(
        app.db,
        [course.id],
        shown.map(({ user }) => user.id),
      );
      const students: CourseStudentItem[] = shown.map(({ grant, user }) => {
        const entry = progressOf(all, course.id, user.id);
        return {
          user: { id: user.id, name: user.name, email: user.email },
          grant: toGrant(grant, now),
          progress: summarizeStudent(detail, entry),
          lastActivityAt: entry.lastActivityAt?.toISOString() ?? null,
        };
      });
      return { students };
    },
  );
};
