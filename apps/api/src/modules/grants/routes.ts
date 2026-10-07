import {
  createGrantRequestSchema,
  extendGrantRequestSchema,
  grantIdParamsSchema,
  grantResponseSchema,
  listGrantsQuerySchema,
  listGrantsResponseSchema,
  type GrantStatus,
} from '@opencourse/shared';
import { and, desc, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { courses, grants, users } from '../../db/schema';
import { badRequest, conflict, isUniqueViolation, notFound } from '../../errors';
import { requireManagedCourse } from '../courses/access';
import { toGrant } from './mappers';
import { grantOrExtend, loadManagedGrant, revokeGrantRow, setGrantExpiry } from './service';

/** SQL form of the effective status, so filtering agrees with what `toGrant` reports. */
function statusCondition(status: GrantStatus, now: Date) {
  switch (status) {
    case 'revoked':
      return isNotNull(grants.revokedAt);
    case 'expired':
      return and(isNull(grants.revokedAt), isNotNull(grants.expiresAt), lte(grants.expiresAt, now));
    case 'active':
      return and(isNull(grants.revokedAt), or(isNull(grants.expiresAt), gt(grants.expiresAt, now)));
  }
}

export const grantRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/grants',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['grants'],
        summary: 'List grants',
        description:
          'Admins see every grant; instructors see the grants of the courses they own. `status` is the effective one.',
        querystring: listGrantsQuerySchema,
        response: { 200: listGrantsResponseSchema },
      },
    },
    async (request) => {
      const { user } = request.auth!;
      const { courseId, userId, status } = request.query;
      const now = new Date();
      const rows = await app.db
        .select({ grant: grants })
        .from(grants)
        .innerJoin(courses, eq(courses.id, grants.courseId))
        .where(
          and(
            user.role === 'admin' ? undefined : eq(courses.instructorId, user.id),
            courseId ? eq(grants.courseId, courseId) : undefined,
            userId ? eq(grants.userId, userId) : undefined,
            status ? statusCondition(status, now) : undefined,
          ),
        )
        .orderBy(desc(grants.createdAt), desc(grants.id));
      return { grants: rows.map((row) => toGrant(row.grant, now)) };
    },
  );

  app.post(
    '/grants/:id/revoke',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['grants'],
        summary: 'Revoke a grant',
        description: 'Idempotent: revoking a revoked grant answers 200 and changes nothing.',
        params: grantIdParamsSchema,
        response: { 200: grantResponseSchema },
      },
    },
    async (request) => {
      const manager = request.auth!.user;
      const now = new Date();
      const row = await app.db.transaction(async (tx) => {
        const grant = await loadManagedGrant(tx, manager, request.params.id);
        return revokeGrantRow(tx, grant, manager.id, now);
      });
      return { grant: toGrant(row, now) };
    },
  );

  app.post(
    '/grants/:id/extend',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['grants'],
        summary: 'Set a new expiry for a grant',
        description:
          'The date replaces the current expiry (null for lifetime) and reactivates an expired grant. Revoked grants answer 409: grant access again instead.',
        params: grantIdParamsSchema,
        body: extendGrantRequestSchema,
        response: { 200: grantResponseSchema },
      },
    },
    async (request) => {
      const manager = request.auth!.user;
      const now = new Date();
      const expiresAt = request.body.expiresAt ? new Date(request.body.expiresAt) : null;
      const row = await app.db.transaction(async (tx) => {
        // access first (404/403), so a stranger learns nothing about the grant's state
        const grant = await loadManagedGrant(tx, manager, request.params.id);
        if (grant.revokedAt) throw conflict('A revoked grant cannot be extended');
        if (expiresAt && expiresAt <= now) throw badRequest('Expiry must be in the future');
        return setGrantExpiry(tx, grant, expiresAt, manager.id);
      });
      return { grant: toGrant(row, now) };
    },
  );

  app.post(
    '/grants',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['grants'],
        summary: 'Grant a user access to a course',
        description:
          'Answers 201 for a new grant. When the user already has an open grant the request replaces its expiry and answers 200, so grants never stack.',
        body: createGrantRequestSchema,
        response: { 200: grantResponseSchema, 201: grantResponseSchema },
      },
    },
    async (request, reply) => {
      const manager = request.auth!.user;
      const { userId, courseId } = request.body;
      const now = new Date();

      const [course] = await app.db.select().from(courses).where(eq(courses.id, courseId));
      await requireManagedCourse(app.db, manager, course);

      const expiresAt = request.body.expiresAt ? new Date(request.body.expiresAt) : null;
      if (expiresAt && expiresAt <= now) throw badRequest('Expiry must be in the future');

      // unknown and deactivated users look the same
      const [recipient] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.active, true)));
      if (!recipient) throw notFound('User not found');

      const write = () =>
        app.db.transaction((tx) =>
          grantOrExtend(tx, { userId, courseId, expiresAt, actorId: manager.id }),
        );
      let result;
      try {
        result = await write();
      } catch (error) {
        // lost a race on the partial unique index: the winner's row now exists, so extend it
        if (!isUniqueViolation(error)) throw error;
        result = await write();
      }
      return reply.code(result.created ? 201 : 200).send({ grant: toGrant(result.row, now) });
    },
  );
};
