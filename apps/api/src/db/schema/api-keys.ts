import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Credential for a server-side plugin. Only the hash is stored, so a database leak does not hand
 * out usable keys. The key acts as the admin who created it and is accepted only by the grant
 * routes; it stops working when that admin is deactivated or loses the role.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** First characters of the token, so admins can tell keys apart in a list. */
    tokenPrefix: text('token_prefix').notNull(),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [index('api_keys_created_by_id_idx').on(table.createdById)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
