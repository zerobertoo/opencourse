import {
  listAuditLogQuerySchema,
  listAuditLogResponseSchema,
  listUsersQuerySchema,
  listUsersResponseSchema,
  setUserActiveRequestSchema,
  updateUserRoleRequestSchema,
  userResponseSchema,
  type AuditLogEntry,
} from '@opencourse/shared';
import { and, desc, eq, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recordAudit } from '../../audit';
import { revokeUserSessions } from '../../auth/sessions';
import { auditLog, users } from '../../db/schema';
import { conflict, forbidden, notFound } from '../../errors';
import { toPublicUser } from '../../mappers';
import { escapeLike } from '../../sql';
import type { Database } from '../../plugins/db';
import { ADMIN_GUARD_LOCK_ID } from '../../users/create-user';

const userIdParamsSchema = z.object({ id: z.uuid() });

/**
 * Runs `change` in a transaction that holds the admin guard lock, so two admins demoting each
 * other at the same moment cannot both pass the "another admin exists" check.
 */
async function withAdminGuardLock<T>(
  db: Database,
  change: (tx: Parameters<Parameters<Database['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_GUARD_LOCK_ID})`);
    return change(tx);
  });
}

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/admin/users',
    {
      preHandler: app.requireRole('admin', 'instructor'),
      schema: {
        tags: ['admin'],
        summary: 'List users',
        querystring: listUsersQuerySchema,
        response: { 200: listUsersResponseSchema },
      },
    },
    async (request) => {
      const { search, role, active } = request.query;
      const filters: (SQL | undefined)[] = [
        role ? eq(users.role, role) : undefined,
        active === undefined ? undefined : eq(users.active, active),
      ];
      if (search) {
        const pattern = `%${escapeLike(search)}%`;
        filters.push(or(ilike(users.name, pattern), ilike(users.email, pattern)));
      }
      const rows = await app.db
        .select()
        .from(users)
        .where(and(...filters))
        .orderBy(users.name);
      return { users: rows.map(toPublicUser) };
    },
  );

  app.get(
    '/users/:id',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['admin'],
        summary: 'Get one user',
        description: 'Users can read themselves; instructors and admins can read anyone.',
        params: userIdParamsSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (request) => {
      const { user: requester } = request.auth!;
      if (requester.id !== request.params.id && requester.role === 'student') throw forbidden();
      const [row] = await app.db.select().from(users).where(eq(users.id, request.params.id));
      if (!row) throw notFound('User not found');
      return { user: toPublicUser(row) };
    },
  );

  app.patch(
    '/admin/users/:id/role',
    {
      preHandler: app.requireRole('admin'),
      schema: {
        tags: ['admin'],
        summary: 'Change the role of a user',
        params: userIdParamsSchema,
        body: updateUserRoleRequestSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (request) => {
      const actorId = request.auth!.user.id;
      const { role } = request.body;

      const updated = await withAdminGuardLock(app.db, async (tx) => {
        const [target] = await tx.select().from(users).where(eq(users.id, request.params.id));
        if (!target) throw notFound('User not found');
        if (target.role === 'admin' && role !== 'admin' && target.active) {
          await assertAnotherActiveAdmin(tx, target.id);
        }
        const [changed] = await tx
          .update(users)
          .set({ role, updatedAt: new Date() })
          .where(eq(users.id, target.id))
          .returning();
        await recordAudit(tx, {
          actorId,
          action: 'user.role_changed',
          targetType: 'user',
          targetId: target.id,
          metadata: { from: target.role, to: role },
        });
        return changed!;
      });
      return { user: toPublicUser(updated) };
    },
  );

  app.patch(
    '/admin/users/:id/active',
    {
      preHandler: app.requireRole('admin'),
      schema: {
        tags: ['admin'],
        summary: 'Activate or deactivate a user',
        description: 'A deactivated user is signed out everywhere and cannot sign in.',
        params: userIdParamsSchema,
        body: setUserActiveRequestSchema,
        response: { 200: userResponseSchema },
      },
    },
    async (request) => {
      const actorId = request.auth!.user.id;
      const { active } = request.body;

      const updated = await withAdminGuardLock(app.db, async (tx) => {
        const [target] = await tx.select().from(users).where(eq(users.id, request.params.id));
        if (!target) throw notFound('User not found');
        if (!active && target.role === 'admin' && target.active) {
          await assertAnotherActiveAdmin(tx, target.id);
        }
        const now = new Date();
        const [changed] = await tx
          .update(users)
          .set({ active, updatedAt: now })
          .where(eq(users.id, target.id))
          .returning();
        if (!active) await revokeUserSessions(tx, target.id, now);
        await recordAudit(tx, {
          actorId,
          action: active ? 'user.reactivated' : 'user.deactivated',
          targetType: 'user',
          targetId: target.id,
        });
        return changed!;
      });
      return { user: toPublicUser(updated) };
    },
  );

  app.get(
    '/admin/audit',
    {
      preHandler: app.requireRole('admin'),
      schema: {
        tags: ['admin'],
        summary: 'Administrative audit log, newest first',
        querystring: listAuditLogQuerySchema,
        response: { 200: listAuditLogResponseSchema },
      },
    },
    async (request) => {
      const rows = await app.db
        .select()
        .from(auditLog)
        .orderBy(desc(auditLog.createdAt))
        .limit(request.query.limit)
        .offset(request.query.offset);
      const entries: AuditLogEntry[] = rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      }));
      return { entries };
    },
  );
};

/** Throws a conflict unless some other active admin exists besides `userId`. */
async function assertAnotherActiveAdmin(
  db: Pick<Database, 'select'>,
  userId: string,
): Promise<void> {
  const others = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.active, true), ne(users.id, userId)))
    .limit(1);
  if (others.length === 0) throw conflict('The platform needs at least one active admin');
}
