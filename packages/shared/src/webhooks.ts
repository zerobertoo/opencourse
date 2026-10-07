import { z } from 'zod';
import { idSchema, isoDateSchema } from './base';
import { domainEventNameSchema } from './events';

/** Headers of every webhook request; receivers verify the signature and deduplicate by delivery id. */
export const WEBHOOK_EVENT_HEADER = 'OpenCourse-Event';
export const WEBHOOK_DELIVERY_HEADER = 'OpenCourse-Delivery';
export const WEBHOOK_SIGNATURE_HEADER = 'OpenCourse-Signature';
/** Type of the synthetic event sent by the test action; never stored as a delivery. */
export const WEBHOOK_TEST_EVENT = 'webhook.test';

/** Body of every webhook request. `id` is the outbox event id, stable across retries. */
export const webhookEnvelopeSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  createdAt: isoDateSchema,
  data: z.record(z.string(), z.unknown()),
});
export type WebhookEnvelope = z.infer<typeof webhookEnvelopeSchema>;

const webhookUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), 'Only http and https URLs are accepted');

const webhookEventsSchema = z
  .array(domainEventNameSchema)
  .min(1)
  .refine((names) => new Set(names).size === names.length, 'Events must be unique');

export const webhookEndpointSchema = z.object({
  id: idSchema,
  url: webhookUrlSchema,
  description: z.string(),
  events: webhookEventsSchema,
  active: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

/** The secret travels only in the response to create and rotate; reads never include it. */
export const webhookEndpointWithSecretSchema = webhookEndpointSchema.extend({
  secret: z.string().min(1),
});
export type WebhookEndpointWithSecret = z.infer<typeof webhookEndpointWithSecretSchema>;

export const webhookIdParamsSchema = z.object({ id: idSchema });

export const createWebhookRequestSchema = z
  .object({
    url: webhookUrlSchema,
    description: z.string().trim().max(200).default(''),
    events: webhookEventsSchema,
    active: z.boolean().default(true),
  })
  .strict();
export type CreateWebhookRequest = z.input<typeof createWebhookRequestSchema>;

export const updateWebhookRequestSchema = z
  .object({
    url: webhookUrlSchema,
    description: z.string().trim().max(200),
    events: webhookEventsSchema,
    active: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateWebhookRequest = z.infer<typeof updateWebhookRequestSchema>;

export const webhookResponseSchema = z.object({ webhook: webhookEndpointSchema });
export type WebhookResponse = z.infer<typeof webhookResponseSchema>;

export const webhookWithSecretResponseSchema = z.object({
  webhook: webhookEndpointWithSecretSchema,
});
export type WebhookWithSecretResponse = z.infer<typeof webhookWithSecretResponseSchema>;

export const listWebhooksResponseSchema = z.object({ webhooks: z.array(webhookEndpointSchema) });
export type ListWebhooksResponse = z.infer<typeof listWebhooksResponseSchema>;

export const webhookDeliveryStatusSchema = z.enum(['pending', 'succeeded', 'failed']);
export type WebhookDeliveryStatus = z.infer<typeof webhookDeliveryStatusSchema>;

export const webhookDeliverySchema = z.object({
  id: idSchema,
  endpointId: idSchema,
  eventId: idSchema,
  eventName: domainEventNameSchema,
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int().min(0),
  lastStatusCode: z.number().int().nullable(),
  lastError: z.string().nullable(),
  createdAt: isoDateSchema,
  lastAttemptAt: isoDateSchema.nullable(),
  deliveredAt: isoDateSchema.nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const listWebhookDeliveriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListWebhookDeliveriesQuery = z.infer<typeof listWebhookDeliveriesQuerySchema>;

export const listWebhookDeliveriesResponseSchema = z.object({
  deliveries: z.array(webhookDeliverySchema),
});
export type ListWebhookDeliveriesResponse = z.infer<typeof listWebhookDeliveriesResponseSchema>;

export const webhookDeliveryParamsSchema = z.object({ id: idSchema });

export const webhookDeliveryResponseSchema = z.object({ delivery: webhookDeliverySchema });
export type WebhookDeliveryResponse = z.infer<typeof webhookDeliveryResponseSchema>;

/** Outcome of the test action: the receiver's status code, or why no response came back. */
export const webhookTestResultSchema = z.object({
  succeeded: z.boolean(),
  statusCode: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type WebhookTestResult = z.infer<typeof webhookTestResultSchema>;
