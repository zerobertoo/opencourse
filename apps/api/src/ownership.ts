import { eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { UserRow } from './db/schema';

/** Query filter for "admins see everything, everyone else only what they own". */
export function ownedUnlessAdmin(user: UserRow, ownerColumn: PgColumn): SQL | undefined {
  return user.role === 'admin' ? undefined : eq(ownerColumn, user.id);
}
