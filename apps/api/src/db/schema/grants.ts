import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { users } from './users';

export const grantSource = pgEnum('grant_source', ['manual', 'invite', 'plugin']);

/** Access of a user to a course. Status is derived: revoked, expired by date, or active. */
export const grants = pgTable(
  'grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    source: grantSource('source').notNull(),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null means lifetime access. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // at most one open (not revoked) grant per user and course; extend it instead of stacking
    uniqueIndex('grants_open_user_course_idx')
      .on(table.userId, table.courseId)
      .where(sql`${table.revokedAt} is null`),
    index('grants_course_idx').on(table.courseId),
  ],
);

export type GrantRow = typeof grants.$inferSelect;
