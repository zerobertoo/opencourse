import {
  courseIdParamsSchema,
  courseResponseSchema,
  courseSlugParamsSchema,
  createCourseRequestSchema,
  listCoursesQuerySchema,
  listCoursesResponseSchema,
  updateCourseRequestSchema,
} from '@opencourse/shared';
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, courseTranslations, grants, type CourseRow } from '../../db/schema';
import { recordAudit } from '../../audit';
import { conflict, forbidden, isUniqueViolation, notFound } from '../../errors';
import { escapeLike } from '../../sql';
import { requireManagedCourseById, resolveCourseAccess } from './access';
import { activeGrantCondition } from '../grants/active';
import { toGrant } from '../grants/mappers';
import { deleteReplacedCover } from './cover';
import { loadCourseDetail, loadCourseDetails } from './detail';
import { toListedCourse } from './listed';
import { assertPublishable } from './publish';
import { redactQuizAnswers } from './redact';
import { slugify } from './slug';
import { ownedUnlessAdmin } from '../../ownership';
import { authContext } from '../../plugins/auth';

const MAX_SLUG_ATTEMPTS = 20;

export const courseRoutes: FastifyPluginAsyncZod = async (app) => {
  /**
   * Course the caller may open, with its curriculum. Invisible courses answer 404 so a draft's
   * existence does not leak; visible ones without a grant answer 403.
   */
  async function readCourse(request: FastifyRequest, course: CourseRow | undefined) {
    if (!course) throw notFound('Course not found');
    const access = await resolveCourseAccess(app.db, authContext(request).user, course, new Date());
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
      const { user } = authContext(request);
      const { scope, status, search } = request.query;
      const now = new Date();

      let visibility: SQL | undefined;
      if (scope === 'managed') {
        if (user.role === 'student') throw forbidden();
        visibility = ownedUnlessAdmin(user, courses.instructorId);
      } else {
        const grantedCourseIds = app.db
          .select({ id: grants.courseId })
          .from(grants)
          .where(and(eq(grants.userId, user.id), activeGrantCondition(now)));
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
      if (rows.length === 0) return { courses: [] };

      const details = await loadCourseDetails(app.db, rows);
      // the caller's own open grant per course (at most one: the partial unique index)
      const ownGrants = await app.db
        .select()
        .from(grants)
        .where(
          and(
            eq(grants.userId, user.id),
            isNull(grants.revokedAt),
            inArray(
              grants.courseId,
              rows.map((row) => row.id),
            ),
          ),
        );
      return {
        courses: details.map((detail) => {
          const ownGrant = ownGrants.find((grant) => grant.courseId === detail.id);
          return toListedCourse(detail, ownGrant ? toGrant(ownGrant, now) : null);
        }),
      };
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
      const [course] = await app.db.select().from(courses).where(eq(courses.id, request.params.id));
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
      const { user } = authContext(request);
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
      const course = await requireManagedCourseById(
        app.db,
        authContext(request).user,
        request.params.id,
      );
      const { translations, ...fields } = request.body;
      const actorId = authContext(request).user.id;

      const result = await app.db.transaction(async (tx) => {
        const before = course.status === 'published' ? await loadCourseDetail(tx, course) : null;
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
        assertPublishable(before, detail);
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
      // a link set here replaces an uploaded cover, whose file would otherwise stay behind
      if (result.course.coverImageUrl !== course.coverImageUrl) {
        await deleteReplacedCover(app.storage, course.id, course.coverImageUrl, request.log);
      }
      return result;
    },
  );
};
