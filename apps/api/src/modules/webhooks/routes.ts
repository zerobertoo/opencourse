import { randomBytes, randomUUID } from 'node:crypto';
import {
  WEBHOOK_TEST_EVENT,
  createWebhookRequestSchema,
  listWebhookDeliveriesQuerySchema,
  listWebhookDeliveriesResponseSchema,
  listWebhooksResponseSchema,
  updateWebhookRequestSchema,
  webhookDeliveryParamsSchema,
  webhookDeliveryResponseSchema,
  webhookIdParamsSchema,
  webhookResponseSchema,
  webhookTestResultSchema,
  webhookWithSecretResponseSchema,
  type WebhookEnvelope,
} from '@opencourse/shared';
import { Queue } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { recordAudit } from '../../audit';
import type { Config } from '../../config';
import { webhookDeliveries, webhookEndpoints } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import {
  deliveryJobAdder,
  DEFAULT_QUEUE_PREFIX,
  QUEUE_NAME,
  type JobData,
} from '../../worker/jobs';
import { postWebhook } from './http';
import { toWebhook, toWebhookDelivery } from './mappers';

const TEST_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 30_000;

export interface WebhookRoutesOptions {
  config: Config;
  /** Isolates the queue keys; must match the worker's. Tests give each file its own. */
  queuePrefix?: string | undefined;
}

/** `whsec_` plus 256 random bits, shown to the admin once. */
function generateSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

export const webhookRoutes: FastifyPluginAsyncZod<WebhookRoutesOptions> = async (
  app,
  { config, queuePrefix },
) => {
  const allowPrivate = config.WEBHOOKS_ALLOW_PRIVATE_NETWORKS;

  // plain http is only for local receivers, which also need the private-network opt-in
  function requireAllowedUrl(url: string): void {
    if (new URL(url).protocol !== 'https:' && !allowPrivate) {
      throw badRequest('Webhook URLs must use https');
    }
  }

  // the API only adds manual retries to the worker's queue, so it connects on first use
  let queue: Queue<JobData> | undefined;
  const getQueue = () =>
    (queue ??= new Queue<JobData>(QUEUE_NAME, {
      connection: app.redis,
      prefix: queuePrefix ?? DEFAULT_QUEUE_PREFIX,
    }));
  app.addHook('onClose', async () => {
    await queue?.close();
  });

  const guard = { preHandler: app.requireRole('admin') };

  app.get(
    '/admin/webhooks',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'List webhook endpoints',
        response: { 200: listWebhooksResponseSchema },
      },
    },
    async () => {
      const rows = await app.db
        .select()
        .from(webhookEndpoints)
        .orderBy(desc(webhookEndpoints.createdAt), desc(webhookEndpoints.id));
      return { webhooks: rows.map(toWebhook) };
    },
  );

  app.post(
    '/admin/webhooks',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Create a webhook endpoint',
        description:
          'The signing secret is in this response only; it is never returned again except by rotating it.',
        body: createWebhookRequestSchema,
        response: { 201: webhookWithSecretResponseSchema },
      },
    },
    async (request, reply) => {
      requireAllowedUrl(request.body.url);
      const secret = generateSecret();
      const row = await app.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(webhookEndpoints)
          .values({ ...request.body, secret, createdById: request.auth!.user.id })
          .returning();
        if (!created) throw new Error('Failed to create webhook');
        await recordAudit(tx, {
          actorId: request.auth!.user.id,
          action: 'webhook.created',
          targetType: 'webhook',
          targetId: created.id,
          metadata: { url: created.url, events: created.events },
        });
        return created;
      });
      return reply.code(201).send({ webhook: { ...toWebhook(row), secret } });
    },
  );

  app.patch(
    '/admin/webhooks/:id',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Change a webhook endpoint',
        params: webhookIdParamsSchema,
        body: updateWebhookRequestSchema,
        response: { 200: webhookResponseSchema },
      },
    },
    async (request) => {
      if (request.body.url) requireAllowedUrl(request.body.url);
      const row = await app.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(webhookEndpoints)
          .set({ ...request.body, updatedAt: new Date() })
          .where(eq(webhookEndpoints.id, request.params.id))
          .returning();
        if (!updated) throw notFound('Webhook not found');
        await recordAudit(tx, {
          actorId: request.auth!.user.id,
          action: 'webhook.updated',
          targetType: 'webhook',
          targetId: updated.id,
          metadata: { changed: Object.keys(request.body) },
        });
        return updated;
      });
      return { webhook: toWebhook(row) };
    },
  );

  app.delete(
    '/admin/webhooks/:id',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Delete a webhook endpoint and its delivery history',
        params: webhookIdParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await app.db.transaction(async (tx) => {
        const [deleted] = await tx
          .delete(webhookEndpoints)
          .where(eq(webhookEndpoints.id, request.params.id))
          .returning();
        if (!deleted) throw notFound('Webhook not found');
        await recordAudit(tx, {
          actorId: request.auth!.user.id,
          action: 'webhook.deleted',
          targetType: 'webhook',
          targetId: deleted.id,
          metadata: { url: deleted.url },
        });
      });
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/admin/webhooks/:id/rotate-secret',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Replace the signing secret',
        description: 'The old secret stops working at once. The new one is in this response only.',
        params: webhookIdParamsSchema,
        response: { 200: webhookWithSecretResponseSchema },
      },
    },
    async (request) => {
      const secret = generateSecret();
      const row = await app.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(webhookEndpoints)
          .set({ secret, updatedAt: new Date() })
          .where(eq(webhookEndpoints.id, request.params.id))
          .returning();
        if (!updated) throw notFound('Webhook not found');
        await recordAudit(tx, {
          actorId: request.auth!.user.id,
          action: 'webhook.secret_rotated',
          targetType: 'webhook',
          targetId: updated.id,
        });
        return updated;
      });
      return { webhook: { ...toWebhook(row), secret } };
    },
  );

  app.post(
    '/admin/webhooks/:id/test',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Send a test event',
        description:
          'Sends a synthetic `webhook.test` event right now and reports what the receiver answered. Nothing is stored in the delivery history.',
        params: webhookIdParamsSchema,
        response: { 200: webhookTestResultSchema },
      },
    },
    async (request) => {
      const [endpoint] = await app.db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, request.params.id));
      if (!endpoint) throw notFound('Webhook not found');
      const envelope: WebhookEnvelope = {
        id: randomUUID(),
        type: WEBHOOK_TEST_EVENT,
        createdAt: new Date().toISOString(),
        data: { message: 'This is a test event from OpenCourse.' },
      };
      const result = await postWebhook({
        url: endpoint.url,
        secret: endpoint.secret,
        eventName: WEBHOOK_TEST_EVENT,
        deliveryId: envelope.id,
        body: JSON.stringify(envelope),
        allowPrivateNetworks: allowPrivate,
        timeoutMs: TEST_TIMEOUT_MS,
      });
      const succeeded =
        result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
      return {
        succeeded,
        statusCode: result.statusCode,
        error: result.error ?? (succeeded ? null : `Receiver answered ${result.statusCode}`),
      };
    },
  );

  app.get(
    '/admin/webhooks/:id/deliveries',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Delivery history of an endpoint, newest first',
        description: 'Kept for 7 days.',
        params: webhookIdParamsSchema,
        querystring: listWebhookDeliveriesQuerySchema,
        response: { 200: listWebhookDeliveriesResponseSchema },
      },
    },
    async (request) => {
      const [endpoint] = await app.db
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, request.params.id));
      if (!endpoint) throw notFound('Webhook not found');
      const rows = await app.db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.endpointId, endpoint.id))
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(request.query.limit)
        .offset(request.query.offset);
      return { deliveries: rows.map(toWebhookDelivery) };
    },
  );

  app.post(
    '/admin/webhook-deliveries/:id/retry',
    {
      ...guard,
      schema: {
        tags: ['webhooks'],
        summary: 'Try a failed delivery again',
        params: webhookDeliveryParamsSchema,
        response: { 200: webhookDeliveryResponseSchema },
      },
    },
    async (request) => {
      // the status flips first, so two clicks cannot queue the delivery twice
      const [row] = await app.db
        .update(webhookDeliveries)
        .set({ status: 'pending' })
        .where(
          and(eq(webhookDeliveries.id, request.params.id), eq(webhookDeliveries.status, 'failed')),
        )
        .returning();
      if (!row) {
        const [existing] = await app.db
          .select({ id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.id, request.params.id));
        if (!existing) throw notFound('Delivery not found');
        throw conflict('Only a failed delivery can be retried');
      }
      try {
        await deliveryJobAdder(getQueue(), RETRY_DELAY_MS)(row.id, `${row.id}-retry-${Date.now()}`);
      } catch (error) {
        await app.db
          .update(webhookDeliveries)
          .set({ status: 'failed' })
          .where(eq(webhookDeliveries.id, row.id));
        throw error;
      }
      return { delivery: toWebhookDelivery(row) };
    },
  );
};
