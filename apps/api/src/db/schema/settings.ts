import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Platform-wide settings as key/value pairs (branding, languages, video adapter, SMTP). */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
