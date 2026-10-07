import type { CertificateTemplate } from '@opencourse/shared';
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { courses } from './courses';
import { users } from './users';

/**
 * An issued certificate. The holder name, titles and template are copied at issue time, so editing
 * a profile or a course later never changes what a verification page shows.
 */
export const certificates = pgTable(
  'certificates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** Public code, `OC-XXXX-XXXX`. */
    code: text('code').notNull().unique(),
    holderName: text('holder_name').notNull(),
    /** Course title per locale. */
    courseTitles: jsonb('course_titles').$type<Record<string, string>>().notNull(),
    defaultLocale: text('default_locale').notNull(),
    template: jsonb('template').$type<Omit<CertificateTemplate, 'enabled'>>().notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null until the e-mail went out; a future worker can retry the nulls. */
    emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  },
  (table) => [
    // one certificate per student and course, forever: this is the idempotency guarantee
    unique('certificates_user_course_unique').on(table.userId, table.courseId),
    index('certificates_user_idx').on(table.userId),
  ],
);

export type CertificateRow = typeof certificates.$inferSelect;
