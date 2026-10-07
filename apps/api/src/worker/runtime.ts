import { setTimeout as sleep } from 'node:timers/promises';
import type { DomainEventName } from '@opencourse/shared';
import { Queue, Worker, type Job } from 'bullmq';
import { count, isNull } from 'drizzle-orm';
import { Redis } from 'ioredis';
import pino, { type Logger } from 'pino';
import type { Config } from '../config';
import { outboxEvents } from '../db/schema';
import { createSmtpMailer, type Mailer } from '../mail/mailer';
import { removeStaleUploads } from '../modules/video/service';
import { openDatabase } from '../plugins/db';
import { createS3Storage, type Storage } from '../storage/s3';
import { consumers } from './consumers';
import {
  DEFAULT_QUEUE_PREFIX,
  DEFAULT_RETRY_DELAY_MS,
  deliveryJobAdder,
  JOB_ATTEMPTS,
  QUEUE_NAME,
  VIDEO_QUEUE_NAME,
  type JobData,
} from './jobs';
import { purgeDispatchedEvents, relayPendingEvents } from './relay';

const PURGE_EVERY_MS = 60 * 60 * 1000;

export interface WorkerOptions {
  /** Replaces the SMTP mailer, so tests can read what would have been sent. */
  mailer?: Mailer;
  /** Replaces the S3 storage. */
  storage?: Storage;
  logger?: Logger;
  /** Isolates the queue keys; tests give each file its own. */
  queuePrefix?: string;
  /** How often the relay looks for pending events. */
  pollIntervalMs?: number;
  /** First retry delay; each further retry doubles it. */
  retryDelayMs?: number;
  /** Time a webhook receiver gets to answer. */
  webhookTimeoutMs?: number;
}

export interface WorkerRuntime {
  /** Stops polling, lets the running job finish, then closes every connection. */
  stop(): Promise<void>;
  /** Resolves when no event is pending and the queue has nothing waiting, running or delayed. */
  drain(timeoutMs?: number): Promise<void>;
}

/** Starts the relay loop and the queue worker. Used by `worker.ts` and by the tests. */
export async function startWorker(
  config: Config,
  options: WorkerOptions = {},
): Promise<WorkerRuntime> {
  const log = options.logger ?? pino({ level: config.LOG_LEVEL });
  const prefix = options.queuePrefix ?? DEFAULT_QUEUE_PREFIX;
  const pollIntervalMs = options.pollIntervalMs ?? 1000;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const mailer = options.mailer ?? createSmtpMailer(config);
  const storage = options.storage ?? createS3Storage(config);

  const { db, close: closeDatabase } = openDatabase(config.DATABASE_URL, 5);
  // adding a job must fail fast when Redis is down (the relay holds a transaction open);
  // the worker connection blocks and retries forever, as BullMQ requires
  const queueConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
  const workerConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  for (const connection of [queueConnection, workerConnection]) {
    connection.on('error', (error) => log.warn({ err: error }, 'redis connection error'));
  }
  const queue = new Queue<JobData>(QUEUE_NAME, { connection: queueConnection, prefix });
  const context = {
    db,
    mailer,
    storage,
    log,
    webBaseUrl: config.WEB_BASE_URL,
    addDeliveryJob: deliveryJobAdder(queue, retryDelayMs),
    allowPrivateNetworks: config.WEBHOOKS_ALLOW_PRIVATE_NETWORKS,
    webhookTimeoutMs: options.webhookTimeoutMs ?? 10_000,
  };

  const handleJob = async (job: Job<JobData>): Promise<void> => {
    const consumer = consumers.find((candidate) => candidate.name === job.name);
    if (!consumer) throw new Error(`No consumer named ${job.name}`);
    await consumer.run(context, job.data.payload, {
      eventId: job.data.eventId,
      // jobs queued by consumers or by the API carry no domain event; their consumers never read this
      eventName: job.data.eventName as DomainEventName,
      eventCreatedAt: job.data.eventCreatedAt,
      isLastAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? JOB_ATTEMPTS),
    });
  };
  const logFailure = (job: Job<JobData> | undefined, error: Error) => {
    const exhausted = job !== undefined && job.attemptsMade >= (job.opts.attempts ?? 1);
    log.error(
      { err: error, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, exhausted },
      exhausted ? 'job failed for good' : 'job failed, will retry',
    );
  };

  const worker = new Worker<JobData>(QUEUE_NAME, handleJob, {
    connection: workerConnection,
    prefix,
    concurrency: 5,
  });
  // encoding is heavy: one video at a time, on its own queue so it never delays e-mails or webhooks
  const videoQueue = new Queue<JobData>(VIDEO_QUEUE_NAME, { connection: queueConnection, prefix });
  const videoWorker = new Worker<JobData>(VIDEO_QUEUE_NAME, handleJob, {
    connection: workerConnection,
    prefix,
    concurrency: 1,
  });
  for (const runner of [worker, videoWorker]) {
    runner.on('error', (error) => log.error({ err: error }, 'queue worker error'));
    runner.on('failed', logFailure);
  }

  const relayOnce = async (): Promise<number> => {
    try {
      return await relayPendingEvents(db, queue, retryDelayMs);
    } catch (error) {
      // events stay in the outbox, so the next pass picks them up
      log.error({ err: error }, 'outbox relay failed');
      return 0;
    }
  };

  const stopSignal = new AbortController();
  let lastPurge = 0;
  const loop = (async () => {
    while (!stopSignal.signal.aborted) {
      // a full batch means there may be more: go again without waiting
      while ((await relayOnce()) > 0 && !stopSignal.signal.aborted);
      if (Date.now() - lastPurge > PURGE_EVERY_MS) {
        lastPurge = Date.now();
        await purgeDispatchedEvents(db).catch((error: unknown) =>
          log.error({ err: error }, 'outbox purge failed'),
        );
        await removeStaleUploads(db, storage, log).catch((error: unknown) =>
          log.error({ err: error }, 'stale upload cleanup failed'),
        );
      }
      await sleep(pollIntervalMs, undefined, { signal: stopSignal.signal }).catch(() => undefined);
    }
  })();

  const isIdle = async (): Promise<boolean> => {
    const [pending] = await db
      .select({ value: count() })
      .from(outboxEvents)
      .where(isNull(outboxEvents.dispatchedAt));
    const states = ['waiting', 'active', 'delayed', 'prioritized'] as const;
    const jobs = [
      ...Object.values(await queue.getJobCounts(...states)),
      ...Object.values(await videoQueue.getJobCounts(...states)),
    ];
    return pending!.value === 0 && jobs.every((value) => value === 0);
  };

  return {
    async stop() {
      stopSignal.abort();
      await loop;
      await worker.close();
      await videoWorker.close();
      await queue.close();
      await videoQueue.close();
      queueConnection.disconnect();
      workerConnection.disconnect();
      await closeDatabase();
    },
    async drain(timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      // two idle checks in a row: a finished job may have just written the next outbox event
      let idleChecks = 0;
      while (idleChecks < 2) {
        if (Date.now() > deadline) throw new Error('Worker did not become idle in time');
        await relayOnce();
        idleChecks = (await isIdle()) ? idleChecks + 1 : 0;
        await sleep(20);
      }
    },
  };
}
