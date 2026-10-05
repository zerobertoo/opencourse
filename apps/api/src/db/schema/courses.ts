import type { Caption, CertificateTemplate, Quiz, VideoAsset } from '@opencourse/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const courseStatus = pgEnum('course_status', ['draft', 'published', 'archived']);
export const lessonType = pgEnum('lesson_type', ['video', 'text', 'file', 'quiz']);

export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    status: courseStatus('status').notNull().default('draft'),
    coverImageUrl: text('cover_image_url'),
    instructorId: uuid('instructor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    defaultLocale: text('default_locale').notNull(),
    sequentialOrder: boolean('sequential_order').notNull().default(false),
    certificateTemplate: jsonb('certificate_template').$type<CertificateTemplate>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('courses_instructor_idx').on(table.instructorId),
    index('courses_status_idx').on(table.status),
  ],
);

export const courseTranslations = pgTable(
  'course_translations',
  {
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    learningOutcomes: jsonb('learning_outcomes').$type<string[]>().notNull().default([]),
  },
  (table) => [primaryKey({ columns: [table.courseId, table.locale] })],
);

export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** Sequential position inside the course, rewritten in a transaction on reorder. */
    position: integer('position').notNull(),
  },
  (table) => [index('modules_course_idx').on(table.courseId)],
);

export const moduleTranslations = pgTable(
  'module_translations',
  {
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
  },
  (table) => [primaryKey({ columns: [table.moduleId, table.locale] })],
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    type: lessonType('type').notNull(),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    /** Video lessons only; external links for now. */
    video: jsonb('video').$type<VideoAsset>(),
    captions: jsonb('captions').$type<Caption[]>().notNull().default([]),
    /** Quiz lessons only; moves to relational tables in milestone 5. */
    quiz: jsonb('quiz').$type<Quiz>(),
  },
  (table) => [index('lessons_module_idx').on(table.moduleId)],
);

export const lessonTranslations = pgTable(
  'lesson_translations',
  {
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    locale: text('locale').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
  },
  (table) => [primaryKey({ columns: [table.lessonId, table.locale] })],
);

export type CourseRow = typeof courses.$inferSelect;
export type CourseTranslationRow = typeof courseTranslations.$inferSelect;
export type ModuleRow = typeof modules.$inferSelect;
export type ModuleTranslationRow = typeof moduleTranslations.$inferSelect;
export type LessonRow = typeof lessons.$inferSelect;
export type LessonTranslationRow = typeof lessonTranslations.$inferSelect;
