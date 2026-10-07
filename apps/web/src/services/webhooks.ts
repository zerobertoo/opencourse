import type {
  CreateWebhookRequest,
  ListWebhookDeliveriesQuery,
  UpdateWebhookRequest,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
  WebhookTestResult,
} from '@opencourse/shared';

/** Outbound webhooks (PRD section 10). Admin only. */
export interface WebhookService {
  list(): Promise<WebhookEndpoint[]>;
  /** The secret is in this result only; it is never returned by `list` or `update`. */
  create(input: CreateWebhookRequest): Promise<WebhookEndpointWithSecret>;
  update(id: string, patch: UpdateWebhookRequest): Promise<WebhookEndpoint>;
  /** Deletes the endpoint together with its delivery history. */
  remove(id: string): Promise<void>;
  /** The old secret stops working at once; the new one is in this result only. */
  rotateSecret(id: string): Promise<WebhookEndpointWithSecret>;
  /** Sends a synthetic event right now and reports what the receiver answered. */
  sendTest(id: string): Promise<WebhookTestResult>;
  /** Newest first; the server keeps 7 days. */
  listDeliveries(
    id: string,
    query?: Partial<ListWebhookDeliveriesQuery>,
  ): Promise<WebhookDelivery[]>;
  /** Only a failed delivery can be retried. */
  retryDelivery(deliveryId: string): Promise<WebhookDelivery>;
}
