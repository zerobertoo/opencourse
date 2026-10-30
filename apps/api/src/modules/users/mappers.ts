import { toLocale, type User } from '@opencourse/shared';
import type { UserRow } from '../../db/schema';

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
