import type { DomainEventName } from '@opencourse/shared';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users';

/** Where signed event notifications are sent. Managed by admins. */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  url: text('url').notNull(),
  description: text('description').notNull().default(''),
  /** Names of the subscribed events; validated by zod, not by an enum, so new events need no migration. */
  events: text('events').array().$type<DomainEventName[]>().notNull(),
  /** Kept readable on purpose: it is needed to sign every request. */
  secret: text('secret').notNull(),
  active: boolean('active').notNull().default(true),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', [
  'pending',
  'succeeded',
  'failed',
]);

/** One event addressed to one endpoint, and what happened when the worker tried to deliver it. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    /** Outbox event id. No foreign key: the outbox purges its rows sooner than the history does. */
    eventId: uuid('event_id').notNull(),
    eventName: text('event_name').$type<DomainEventName>().notNull(),
    /** The envelope that is sent, frozen at fan-out time. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  (table) => [
    // one delivery per event and endpoint: this is what makes the fan-out idempotent
    unique('webhook_deliveries_event_endpoint_unique').on(table.eventId, table.endpointId),
    index('webhook_deliveries_endpoint_idx').on(table.endpointId, sql`${table.createdAt} desc`),
  ],
);

export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
