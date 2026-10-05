import {
  courseIdParamsSchema,
  courseResponseSchema,
  courseSlugParamsSchema,
  createCourseRequestSchema,
  getPublishIssues,
  listCoursesQuerySchema,
  listCoursesResponseSchema,
  updateCourseRequestSchema,
} from '@opencourse/shared';
import { and, desc, eq, gt, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, courseTranslations, grants, type CourseRow } from '../../db/schema';
import { recordAudit } from '../../audit';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../../errors';
import { escapeLike } from '../../sql';
import { resolveCourseAccess } from './access';
import { loadCourseDetail, loadCourseSummaries } from './detail';
import { redactQuizAnswers } from './redact';
import { slugify } from './slug';

const MAX_SLUG_ATTEMPTS = 20;

export const courseRoutes: FastifyPluginAsyncZod = async (app) => {
  /** Course the caller may edit: 404 when invisible, 403 when visible but not theirs. */
  async function requireManagedCourse(request: FastifyRequest, course: CourseRow | undefined) {
    if (!course) throw notFound('Course not found');
    const access = await resolveCourseAccess(app.db, request.auth!.user, course, new Date());
    if (!access.isVisible) throw notFound('Course not found');
    if (!access.canManage) throw forbidden('Only the course instructor or an admin can edit it');
    return course;
  }

  /**
   * Course the caller may open, with its curriculum. Invisible courses answer 404 so a draft's
   * existence does not leak; visible ones without a grant answer 403.
   */
  async function readCourse(request: FastifyRequest, course: CourseRow | undefined) {
    if (!course) throw notFound('Course not found');
    const access = await resolveCourseAccess(app.db, request.auth!.user, course, new Date());
    if (!access.isVisible) throw notFound('Course not found');
    if (!access.canViewContent) throw forbidden('Access to this course requires a grant');
    const detail = await loadCourseDetail(app.db, course);
    return access.canManage ? detail : redactQuizAnswers(detail);
  }

  app.get(
    '/courses',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['courses'],
        summary: 'List courses',
        description:
          'The catalog lists published courses plus archived ones the user still has a grant for. ' +
          'The managed scope lists what the caller can edit: every course for admins, their own for instructors.',
        querystring: listCoursesQuerySchema,
        response: { 200: listCoursesResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { scope, status, search } = request.query;
      const now = new Date();

      let visibility: SQL | undefined;
      if (scope === 'managed') {
        if (user.role === 'student') throw forbidden();
        visibility = user.role === 'admin' ? undefined : eq(courses.instructorId, user.id);
      } else {
        const grantedCourseIds = app.db
          .select({ id: grants.courseId })
          .from(grants)
          .where(
            and(
              eq(grants.userId, user.id),
              isNull(grants.revokedAt),
              or(isNull(grants.expiresAt), gt(grants.expiresAt, now)),
            ),
          );
        visibility = or(
          eq(courses.status, 'published'),
          and(eq(courses.status, 'archived'), inArray(courses.id, grantedCourseIds)),
        );
      }

      const matchesSearch = search
        ? sql`exists (select 1 from ${courseTranslations} where ${courseTranslations.courseId} = ${courses.id} and ${courseTranslations.title} ilike ${`%${escapeLike(search)}%`})`
        : undefined;

      const rows = await app.db
        .select()
        .from(courses)
        .where(and(visibility, status ? eq(courses.status, status) : undefined, matchesSearch))
        .orderBy(desc(courses.createdAt));
      return { courses: await loadCourseSummaries(app.db, rows) };
    },
  );

  app.get(
    '/courses/by-slug/:slug',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['courses'],
        summary: 'Get a course by slug, with its curriculum',
        params: courseSlugParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const [course] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.slug, request.params.slug));
      return { course: await readCourse(request, course) };
    },
  );

  app.get(
    '/courses/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['courses'],
        summary: 'Get a course by id, with its curriculum',
        params: courseIdParamsSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const [course] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, request.params.id));
      return { course: await readCourse(request, course) };
    },
  );

  app.post(
    '/courses',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['courses'],
        summary: 'Create a draft course owned by the caller',
        body: createCourseRequestSchema,
        response: { 201: courseResponseSchema },
      },
    },
    async (request, reply) => {
      const { user } = request.auth!;
      const { title, description, defaultLocale } = request.body;
      const baseSlug = slugify(title);

      for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
        const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
        try {
          const created = await app.db.transaction(async (tx) => {
            const [course] = await tx
              .insert(courses)
              .values({
                slug,
                status: 'draft',
                instructorId: user.id,
                defaultLocale,
                certificateTemplate: {
                  enabled: true,
                  signatoryName: user.name,
                  signatoryRole: '',
                  message: '',
                },
              })
              .returning();
            if (!course) throw new Error('Failed to create course');
            await tx
              .insert(courseTranslations)
              .values({ courseId: course.id, locale: defaultLocale, title, description });
            return course;
          });
          return reply.code(201).send({ course: await loadCourseDetail(app.db, created) });
        } catch (error) {
          // the slug is taken (the unique constraint is the source of truth): try the next suffix
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw conflict('Could not allocate a unique slug');
    },
  );

  app.patch(
    '/courses/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['courses'],
        summary: 'Update a course',
        description:
          'Translations are merged by locale. A course that is (or becomes) published must pass the publish check.',
        params: courseIdParamsSchema,
        body: updateCourseRequestSchema,
        response: { 200: courseResponseSchema },
      },
    },
    async (request) => {
      const [existing] = await app.db
        .select()
        .from(courses)
        .where(eq(courses.id, request.params.id));
      const course = await requireManagedCourse(request, existing);
      const { translations, ...fields } = request.body;
      const actorId = request.auth!.user.id;

      return app.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(courses)
          .set({ ...fields, updatedAt: new Date() })
          .where(eq(courses.id, course.id))
          .returning();
        if (!updated) throw notFound('Course not found');

        for (const translation of translations ?? []) {
          await tx
            .insert(courseTranslations)
            .values({ courseId: course.id, ...translation })
            .onConflictDoUpdate({
              target: [courseTranslations.courseId, courseTranslations.locale],
              set: {
                title: translation.title,
                description: translation.description,
                learningOutcomes: translation.learningOutcomes,
              },
            });
        }

        const detail = await loadCourseDetail(tx, updated);
        if (updated.status === 'published') {
          const issues = getPublishIssues(detail);
          // throwing rolls the whole update back
          if (issues.length > 0) throw badRequest('Course cannot be published yet', { issues });
        }
        if (updated.status !== course.status) {
          await recordAudit(tx, {
            actorId,
            action: 'course.status_changed',
            targetType: 'course',
            targetId: course.id,
            metadata: { from: course.status, to: updated.status },
          });
        }
        return { course: detail };
      });
    },
  );
};
