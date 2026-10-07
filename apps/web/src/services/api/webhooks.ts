import {
  listWebhookDeliveriesResponseSchema,
  listWebhooksResponseSchema,
  webhookDeliveryResponseSchema,
  webhookResponseSchema,
  webhookTestResultSchema,
  webhookWithSecretResponseSchema,
} from '@opencourse/shared';
import type { WebhookService } from '../webhooks';
import type { ApiClient } from './client';

/** `WebhookService` backed by the real API. */
export function createApiWebhookService(client: ApiClient): WebhookService {
  const path = (id: string) => `/admin/webhooks/${encodeURIComponent(id)}`;

  return {
    async list() {
      const { webhooks } = await client.request('GET', '/admin/webhooks', {
        schema: listWebhooksResponseSchema,
      });
      return webhooks;
    },

    async create(input) {
      const { webhook } = await client.request('POST', '/admin/webhooks', {
        body: input,
        schema: webhookWithSecretResponseSchema,
      });
      return webhook;
    },

    async update(id, patch) {
      const { webhook } = await client.request('PATCH', path(id), {
        body: patch,
        schema: webhookResponseSchema,
      });
      return webhook;
    },

    remove: (id) => client.request('DELETE', path(id)),

    async rotateSecret(id) {
      const { webhook } = await client.request('POST', `${path(id)}/rotate-secret`, {
        schema: webhookWithSecretResponseSchema,
      });
      return webhook;
    },

    sendTest: (id) =>
      client.request('POST', `${path(id)}/test`, { schema: webhookTestResultSchema }),

    async listDeliveries(id, query = {}) {
      const { deliveries } = await client.request('GET', `${path(id)}/deliveries`, {
        query: {
          limit: query.limit === undefined ? undefined : String(query.limit),
          offset: query.offset === undefined ? undefined : String(query.offset),
        },
        schema: listWebhookDeliveriesResponseSchema,
      });
      return deliveries;
    },

    async retryDelivery(deliveryId) {
      const { delivery } = await client.request(
        'POST',
        `/admin/webhook-deliveries/${encodeURIComponent(deliveryId)}/retry`,
        { schema: webhookDeliveryResponseSchema },
      );
      return delivery;
    },
  };
}
