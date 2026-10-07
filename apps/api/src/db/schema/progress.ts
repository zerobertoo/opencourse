import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { lessons } from './courses';
import { users } from './users';

/**
 * What a student did in a lesson. It outlives grants on purpose: a revoked or expired grant only
 * hides it, and granting access again brings it back.
 */
export const progress = pgTable(
  'progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    completed: boolean('completed').notNull().default(false),
    videoPositionSeconds: integer('video_position_seconds').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lessonId] }),
    // course-wide reads (students, metrics) go through the lessons, not the user
    index('progress_lesson_idx').on(table.lessonId),
  ],
);

/** Every quiz submission, kept as graded: editing the quiz later never rewrites the history. */
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    /** Question id to chosen option id. */
    answers: jsonb('answers').$type<Record<string, string>>().notNull(),
    score: integer('score').notNull(),
    passed: boolean('passed').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('quiz_attempts_user_lesson_idx').on(table.userId, table.lessonId)],
);

/** A student's personal note on a lesson. */
export const lessonNotes = pgTable(
  'lesson_notes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

export type ProgressRow = typeof progress.$inferSelect;
export type QuizAttemptRow = typeof quizAttempts.$inferSelect;
export type LessonNoteRow = typeof lessonNotes.$inferSelect;
