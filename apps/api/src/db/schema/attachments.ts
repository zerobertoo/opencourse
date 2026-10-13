import {
  bigint,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { lessons } from './courses';

export const attachmentStatus = pgEnum('attachment_status', ['uploading', 'ready']);

/** A file instructors attach to a lesson for students to download. The bytes live in the storage. */
export const lessonAttachments = pgTable(
  'lesson_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Size announced when the upload was requested; checked against what reached the storage. */
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    contentType: text('content_type').notNull(),
    status: attachmentStatus('status').notNull().default('uploading'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('lesson_attachments_lesson_idx').on(table.lessonId)],
);

export type LessonAttachmentRow = typeof lessonAttachments.$inferSelect;
