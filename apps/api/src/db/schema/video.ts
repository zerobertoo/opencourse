import {
  bigint,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { lessons } from './courses';

export const videoAssetStatus = pgEnum('video_asset_status', [
  'uploading',
  'processing',
  'ready',
  'error',
]);

/** A video file sent to this instance. Links to external providers live in `lessons.video`. */
export const videoAssets = pgTable('video_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** One video per lesson; sending another replaces this row. */
  lessonId: uuid('lesson_id')
    .notNull()
    .unique()
    .references(() => lessons.id, { onDelete: 'cascade' }),
  status: videoAssetStatus('status').notNull().default('uploading'),
  errorMessage: text('error_message'),
  /** Size announced when the upload was requested; checked against what reached the storage. */
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  /** Multipart upload id at the storage, cleared once the upload is completed or aborted. */
  uploadId: text('upload_id'),
  durationSeconds: integer('duration_seconds'),
  /** Names of the HLS renditions written by the worker, e.g. `["360p", "720p"]`. */
  renditions: jsonb('renditions').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type VideoAssetRow = typeof videoAssets.$inferSelect;
