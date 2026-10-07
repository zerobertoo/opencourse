import type { DomainEventName } from '@opencourse/shared';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Domain events written in the same transaction as the change that caused them. The worker relay
 * hands each one to its consumers and stamps `dispatched_at`; a crash never loses an event.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').$type<DomainEventName>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** Null while the relay has not handed the event to the queue yet. */
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_events_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.dispatchedAt} is null`),
  ],
);

export type OutboxEventRow = typeof outboxEvents.$inferSelect;
