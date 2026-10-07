import { createWebhookRequestSchema, updateWebhookRequestSchema } from '@opencourse/shared';
import { ServiceError } from '../errors';
import type { WebhookService } from '../webhooks';
import type { MockContext } from './context';
import { clone, toPublicWebhook, type StoredWebhook } from './store';

export function createMockWebhookService(context: MockContext): WebhookService {
  const { store } = context;

  function find(id: string): StoredWebhook {
    const webhook = store.db.webhooks.find((candidate) => candidate.id === id);
    if (!webhook) throw new ServiceError('not_found', `Webhook not found: ${id}`);
    return webhook;
  }

  const newSecret = () => `whsec_mock_${store.nextId('webhook-secret').replaceAll('-', '')}`;

  return {
    list: () =>
      context.run('webhooks.list', () => {
        context.requireRole('admin');
        return clone(
          [...store.db.webhooks]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .map(toPublicWebhook),
        );
      }),

    create: (input) =>
      context.run('webhooks.create', () => {
        context.requireRole('admin');
        const parsed = createWebhookRequestSchema.safeParse(input);
        if (!parsed.success) throw new ServiceError('validation', 'Invalid webhook');
        const now = context.now().toISOString();
        const webhook: StoredWebhook = {
          ...parsed.data,
          id: store.nextId('webhook'),
          secret: newSecret(),
          createdAt: now,
          updatedAt: now,
        };
        store.mutate((db) => {
          db.webhooks.push(webhook);
        });
        return clone({ ...toPublicWebhook(webhook), secret: webhook.secret });
      }),

    update: (id, patch) =>
      context.run('webhooks.update', () => {
        context.requireRole('admin');
        const webhook = find(id);
        const parsed = updateWebhookRequestSchema.safeParse(patch);
        if (!parsed.success) throw new ServiceError('validation', 'Invalid webhook');
        store.mutate(() => {
          Object.assign(webhook, parsed.data, { updatedAt: context.now().toISOString() });
        });
        return clone(toPublicWebhook(webhook));
      }),

    remove: (id) =>
      context.run('webhooks.remove', () => {
        context.requireRole('admin');
        find(id);
        store.mutate((db) => {
          db.webhooks = db.webhooks.filter((candidate) => candidate.id !== id);
          db.webhookDeliveries = db.webhookDeliveries.filter((entry) => entry.endpointId !== id);
        });
      }),

    rotateSecret: (id) =>
      context.run('webhooks.rotateSecret', () => {
        context.requireRole('admin');
        const webhook = find(id);
        store.mutate(() => {
          webhook.secret = newSecret();
          webhook.updatedAt = context.now().toISOString();
        });
        return clone({ ...toPublicWebhook(webhook), secret: webhook.secret });
      }),

    // nothing is sent from the browser: the mock pretends the receiver answered 200
    sendTest: (id) =>
      context.run('webhooks.sendTest', () => {
        context.requireRole('admin');
        find(id);
        return { succeeded: true, statusCode: 200, error: null };
      }),

    listDeliveries: (id, query = {}) =>
      context.run('webhooks.listDeliveries', () => {
        context.requireRole('admin');
        find(id);
        const { limit = 50, offset = 0 } = query;
        return clone(
          store.db.webhookDeliveries
            .filter((entry) => entry.endpointId === id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(offset, offset + limit),
        );
      }),

    retryDelivery: (deliveryId) =>
      context.run('webhooks.retryDelivery', () => {
        context.requireRole('admin');
        const delivery = store.db.webhookDeliveries.find((entry) => entry.id === deliveryId);
        if (!delivery) throw new ServiceError('not_found', `Delivery not found: ${deliveryId}`);
        if (delivery.status !== 'failed') {
          throw new ServiceError('conflict', 'Only a failed delivery can be retried');
        }
        store.mutate(() => {
          delivery.status = 'pending';
        });
        return clone(delivery);
      }),
  };
}
