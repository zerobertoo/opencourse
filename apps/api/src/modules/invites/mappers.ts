import type { Invite, InviteStatus } from '@opencourse/shared';
import type { InviteRow } from '../../db/schema';

/** A pending invite past its expiry date counts as expired, without needing a cleanup job. */
export function effectiveInviteStatus(row: InviteRow, now: Date): InviteStatus {
  return row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status;
}

/** The listing shape of an invite: the token hash is never exposed. */
export function toPublicInvite(row: InviteRow, now: Date): Invite {
  return {
    id: row.id,
    email: row.email,
    courseId: row.courseId,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: effectiveInviteStatus(row, now),
  };
}
