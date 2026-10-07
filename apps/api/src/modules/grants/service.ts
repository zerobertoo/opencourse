import type { GrantSource } from '@opencourse/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../audit';
import { courses, grants, type GrantRow, type UserRow } from '../../db/schema';
import { enqueueEvents } from '../../outbox';
import type { Database } from '../../plugins/db';
import { requireManagedCourse } from '../courses/access';

/** A transaction (or the database itself): helpers here commit together with their audit entry. */
export type GrantWriter = Pick<Database, 'select' | 'insert' | 'update'>;

export interface NewGrant {
  userId: string;
  courseId: string;
  source: GrantSource;
  createdById: string;
  actorId: string | null;
  /** Null means lifetime access. */
  expiresAt: Date | null;
  metadata?: Record<string, unknown>;
}

/** Inserts an open grant and audits it. Fails on the partial unique index if one is already open. */
export async function createGrantRow(tx: GrantWriter, input: NewGrant): Promise<GrantRow> {
  const [row] = await tx
    .insert(grants)
    .values({
      userId: input.userId,
      courseId: input.courseId,
      source: input.source,
      createdById: input.createdById,
      expiresAt: input.expiresAt,
    })
    .returning();
  if (!row) throw new Error('Failed to create grant');
  await recordAudit(tx, {
    actorId: input.actorId,
    action: 'grant.created',
    targetType: 'grant',
    targetId: row.id,
    metadata: {
      userId: row.userId,
      courseId: row.courseId,
      source: row.source,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      ...input.metadata,
    },
  });
  await enqueueEvents(tx, [
    {
      name: 'enrollment.granted',
      payload: {
        grantId: row.id,
        userId: row.userId,
        courseId: row.courseId,
        source: row.source,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
    },
  ]);
  return row;
}

/** Replaces the expiry of an open grant (expired ones become active again) and audits it. */
export async function setGrantExpiry(
  tx: GrantWriter,
  grant: GrantRow,
  expiresAt: Date | null,
  actorId: string,
): Promise<GrantRow> {
  const [row] = await tx
    .update(grants)
    .set({ expiresAt })
    .where(eq(grants.id, grant.id))
    .returning();
  if (!row) throw new Error('Failed to extend grant');
  await recordAudit(tx, {
    actorId,
    action: 'grant.extended',
    targetType: 'grant',
    targetId: row.id,
    metadata: {
      userId: row.userId,
      courseId: row.courseId,
      from: grant.expiresAt?.toISOString() ?? null,
      to: row.expiresAt?.toISOString() ?? null,
    },
  });
  return row;
}

/**
 * Grant the caller may change, locked for the rest of the transaction. Unknown and invisible
 * grants answer the same 404, like course, module and lesson ids; visible courses the caller
 * cannot manage answer 403.
 */
export async function loadManagedGrant(
  tx: GrantWriter,
  user: UserRow,
  grantId: string,
): Promise<GrantRow> {
  const [found] = await tx
    .select({ grant: grants, course: courses })
    .from(grants)
    .innerJoin(courses, eq(courses.id, grants.courseId))
    .where(eq(grants.id, grantId))
    .for('update', { of: grants });
  await requireManagedCourse(tx, user, found?.course, 'Grant not found');
  return found!.grant;
}

/** Closes the grant. Revoking twice is a no-op: the first timestamp and audit entry stand. */
export async function revokeGrantRow(
  tx: GrantWriter,
  grant: GrantRow,
  actorId: string,
  now: Date,
): Promise<GrantRow> {
  if (grant.revokedAt) return grant;
  const [row] = await tx
    .update(grants)
    .set({ revokedAt: now })
    .where(eq(grants.id, grant.id))
    .returning();
  if (!row) throw new Error('Failed to revoke grant');
  await recordAudit(tx, {
    actorId,
    action: 'grant.revoked',
    targetType: 'grant',
    targetId: row.id,
    metadata: { userId: row.userId, courseId: row.courseId },
  });
  await enqueueEvents(tx, [
    {
      name: 'grant.revoked',
      payload: { grantId: row.id, userId: row.userId, courseId: row.courseId },
    },
  ]);
  return row;
}

/**
 * Manual grant: extends the user's open grant for the course when there is one (even an expired
 * one), otherwise opens a new one. The open row is locked, so a concurrent call either waits for
 * it or loses the race on the partial unique index; the caller retries that case once.
 */
export async function grantOrExtend(
  tx: GrantWriter,
  input: { userId: string; courseId: string; expiresAt: Date | null; actorId: string },
): Promise<{ row: GrantRow; created: boolean }> {
  const [open] = await tx
    .select()
    .from(grants)
    .where(
      and(
        eq(grants.userId, input.userId),
        eq(grants.courseId, input.courseId),
        isNull(grants.revokedAt),
      ),
    )
    .for('update');
  if (open) {
    return { row: await setGrantExpiry(tx, open, input.expiresAt, input.actorId), created: false };
  }
  const row = await createGrantRow(tx, {
    userId: input.userId,
    courseId: input.courseId,
    source: 'manual',
    createdById: input.actorId,
    actorId: input.actorId,
    expiresAt: input.expiresAt,
  });
  return { row, created: true };
}
