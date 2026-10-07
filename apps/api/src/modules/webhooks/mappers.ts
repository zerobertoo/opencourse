import type { WebhookDelivery, WebhookEndpoint } from '@opencourse/shared';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../../db/schema';

/** Public shape of an endpoint: never carries the secret. */
export function toWebhook(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    endpointId: row.endpointId,
    eventId: row.eventId,
    eventName: row.eventName,
    status: row.status,
    attempts: row.attempts,
    lastStatusCode: row.lastStatusCode,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}
