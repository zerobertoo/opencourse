import type { Queue } from 'bullmq';
import type { AddDeliveryJob } from '../modules/webhooks/delivery';

/** Queue shared by the worker and the API process, which adds the occasional job (manual retries). */
export const QUEUE_NAME = 'jobs';
export const DEFAULT_QUEUE_PREFIX = 'opencourse:queue';

/** Data carried by every queue job: which outbox event it answers, and its payload. */
export interface JobData {
  eventId: string;
  eventName: string;
  /** When the event was written, as ISO 8601. */
  eventCreatedAt: string;
  payload: unknown;
}

/** First wait before a retry; each further retry doubles it. */
export const DEFAULT_RETRY_DELAY_MS = 30_000;

/** Every job gets this many attempts, doubling the wait between them. */
export const JOB_ATTEMPTS = 5;

export function jobOptions(retryDelayMs: number) {
  return {
    attempts: JOB_ATTEMPTS,
    backoff: { type: 'exponential' as const, delay: retryDelayMs },
    // completed ids stay for a day so a re-added id is still ignored
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { count: 1000 },
  };
}

/**
 * Queues a `deliver-webhook` job. Not tied to an outbox event, so the job data reuses the
 * delivery id as the event id; `jobId` keeps adding the same delivery twice harmless.
 */
export function deliveryJobAdder(queue: Queue<JobData>, retryDelayMs: number): AddDeliveryJob {
  return async (deliveryId, jobId) => {
    await queue.add(
      'deliver-webhook',
      {
        eventId: deliveryId,
        eventName: 'webhook.delivery',
        eventCreatedAt: new Date().toISOString(),
        payload: { deliveryId },
      },
      { ...jobOptions(retryDelayMs), jobId },
    );
  };
}
