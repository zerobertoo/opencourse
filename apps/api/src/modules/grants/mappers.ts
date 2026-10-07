import { computeGrantStatus, type Grant } from '@opencourse/shared';
import type { GrantRow } from '../../db/schema';

/** Public shape of a grant. `status` is the effective one: revoked, expired by date, or active. */
export function toGrant(row: GrantRow, now: Date): Grant {
  const stored: Grant = {
    id: row.id,
    userId: row.userId,
    courseId: row.courseId,
    source: row.source,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: row.revokedAt ? 'revoked' : 'active',
  };
  return { ...stored, status: computeGrantStatus(stored, now) };
}
