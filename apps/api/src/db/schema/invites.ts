import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { users } from './users';

export const inviteStatus = pgEnum('invite_status', ['pending', 'accepted', 'expired', 'revoked']);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    /** The course whose grant is created when the invite is accepted. */
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull().unique(),
    /** `expired` is derived on read from `expiresAt`; the stored value only moves on accept/revoke. */
    status: inviteStatus('status').notNull().default('pending'),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('invites_email_idx').on(table.email)],
);

export type InviteRow = typeof invites.$inferSelect;
