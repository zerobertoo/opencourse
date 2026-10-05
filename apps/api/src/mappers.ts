import {
  DEFAULT_LOCALE,
  localeSchema,
  type Invite,
  type InviteStatus,
  type Locale,
  type User,
} from '@opencourse/shared';
import type { InviteRow, UserRow } from './db/schema';

/** Falls back to the default for a stored locale that is no longer supported. */
export function toLocale(value: string): Locale {
  const parsed = localeSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LOCALE;
}

/** The public shape of a user: never includes the password hash. */
export function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    role: row.role,
    locale: toLocale(row.locale),
    timeZone: row.timeZone,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

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
