import type { DomainEventName, WebhookEnvelope } from '@opencourse/shared';
import { and, arrayContains, eq, sql } from 'drizzle-orm';
import { webhookDeliveries, webhookEndpoints } from '../../db/schema';
import type { Database } from '../../plugins/db';
import { postWebhook } from './http';

/** Adds a `deliver-webhook` job; the id makes adding the same delivery twice harmless. */
export type AddDeliveryJob = (deliveryId: string, jobId: string) => Promise<void>;

export interface FanOutEvent {
  eventId: string;
  eventName: DomainEventName;
  /** When the event was written, as ISO 8601. */
  createdAt: string;
  data: Record<string, unknown>;
}

/**
 * Expands one domain event into one delivery per active endpoint subscribed to it, and queues
 * each. Safe to run again after a crash: rows are unique per event and endpoint, and job ids are
 * the delivery ids, so nothing is duplicated.
 */
export async function fanOutWebhooks(
  db: Database,
  event: FanOutEvent,
  addJob: AddDeliveryJob,
): Promise<void> {
  const endpoints = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(
      and(
        eq(webhookEndpoints.active, true),
        arrayContains(webhookEndpoints.events, [event.eventName]),
      ),
    );
  const envelope: WebhookEnvelope = {
    id: event.eventId,
    type: event.eventName,
    createdAt: event.createdAt,
    data: event.data,
  };
  for (const endpoint of endpoints) {
    await db
      .insert(webhookDeliveries)
      .values({
        endpointId: endpoint.id,
        eventId: event.eventId,
        eventName: event.eventName,
        payload: envelope,
      })
      .onConflictDoNothing();
    // read back instead of using the insert result: after a crash the row already exists
    const [delivery] = await db
      .select({ id: webhookDeliveries.id })
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.eventId, event.eventId),
          eq(webhookDeliveries.endpointId, endpoint.id),
        ),
      );
    if (delivery) await addJob(delivery.id, delivery.id);
  }
}

export interface DeliveryOptions {
  allowPrivateNetworks: boolean;
  timeoutMs: number;
  /** True when the queue will not retry this job again. */
  isLastAttempt: boolean;
}

/** Statuses worth trying again: the receiver may recover or the limit may lift. */
function isRetryable(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 408 || statusCode === 429;
}

/**
 * Sends one delivery and records the outcome. Throws when the queue should try again (a network
 * error, a timeout, 5xx, 408 or 429); on the last attempt it records `failed` before throwing.
 * Anything else that is not 2xx, and a refused destination, fails at once without throwing.
 */
export async function deliverWebhook(
  db: Database,
  deliveryId: string,
  options: DeliveryOptions,
): Promise<void> {
  const [found] = await db
    .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
    .where(eq(webhookDeliveries.id, deliveryId));
  // an endpoint deleted meanwhile takes its deliveries with it (cascade)
  if (!found || found.delivery.status !== 'pending') return;
  const { delivery, endpoint } = found;

  const record = (fields: Partial<typeof webhookDeliveries.$inferInsert>) =>
    db
      .update(webhookDeliveries)
      .set({
        attempts: sql`${webhookDeliveries.attempts} + 1`,
        lastAttemptAt: new Date(),
        ...fields,
      })
      .where(eq(webhookDeliveries.id, deliveryId));

  if (!endpoint.active) {
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed', lastError: 'Endpoint was disabled before delivery' })
      .where(eq(webhookDeliveries.id, deliveryId));
    return;
  }

  const result = await postWebhook({
    url: endpoint.url,
    secret: endpoint.secret,
    eventName: delivery.eventName,
    deliveryId,
    body: JSON.stringify(delivery.payload),
    allowPrivateNetworks: options.allowPrivateNetworks,
    timeoutMs: options.timeoutMs,
  });

  if (result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300) {
    await record({
      status: 'succeeded',
      lastStatusCode: result.statusCode,
      lastError: null,
      deliveredAt: new Date(),
    });
    return;
  }

  const error = result.error ?? `Receiver answered ${result.statusCode}`;
  const retryable =
    !result.refused && (result.statusCode === null || isRetryable(result.statusCode));
  if (!retryable) {
    await record({ status: 'failed', lastStatusCode: result.statusCode, lastError: error });
    return;
  }
  await record({
    status: options.isLastAttempt ? 'failed' : 'pending',
    lastStatusCode: result.statusCode,
    lastError: error,
  });
  throw new Error(`Webhook delivery ${deliveryId} failed: ${error}`);
}
