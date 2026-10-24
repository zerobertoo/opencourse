import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sessions } from './sessions';
import { users } from './users';
import { videoAssets } from './video';

/**
 * Which session of a user is playing an uploaded video right now. One row per user, so an account
 * has a single stream: a lease is live while its last beat is recent and its session still is.
 */
export const streamLeases = pgTable('stream_leases', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id')
    .notNull()
    .references(() => videoAssets.id, { onDelete: 'cascade' }),
  lastBeatAt: timestamp('last_beat_at', { withTimezone: true }).notNull(),
});
