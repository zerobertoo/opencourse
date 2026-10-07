import { asc, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { outboxEvents } from '../db/schema';
import type { Database } from '../plugins/db';
import { consumers } from './consumers';

/** Data carried by every queue job: which outbox event it answers, and its payload. */
export interface JobData {
  eventId: string;
  payload: unknown;
}

const BATCH_SIZE = 100;
const KEEP_DISPATCHED_DAYS = 7;

/** Retry policy shared by every job: 5 attempts, doubling the wait each time. */
export function jobOptions(retryDelayMs: number) {
  return {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: retryDelayMs },
    // completed ids stay for a day so a re-added id is still ignored
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { count: 1000 },
  };
}

/**
 * Hands pending outbox events to the queue, one job per consumer, and stamps them dispatched.
 * Rows are locked with SKIP LOCKED, so several workers never take the same event. The job id is
 * `<eventId>-<consumer>`: a crash between adding and stamping re-adds ids the queue already has.
 * Returns how many events were handed over.
 */
export async function relayPendingEvents(
  db: Database,
  queue: Queue<JobData>,
  retryDelayMs: number,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.dispatchedAt))
      .orderBy(asc(outboxEvents.createdAt))
      .limit(BATCH_SIZE)
      .for('update', { skipLocked: true });
    for (const row of rows) {
      for (const consumer of consumers.filter((candidate) => candidate.event === row.name)) {
        await queue.add(
          consumer.name,
          { eventId: row.id, payload: row.payload },
          { ...jobOptions(retryDelayMs), jobId: `${row.id}-${consumer.name}` },
        );
      }
    }
    if (rows.length > 0) {
      await tx
        .update(outboxEvents)
        .set({ dispatchedAt: new Date() })
        .where(
          inArray(
            outboxEvents.id,
            rows.map((row) => row.id),
          ),
        );
    }
    return rows.length;
  });
}

/** Deletes events dispatched more than a week ago. */
export async function purgeDispatchedEvents(db: Database): Promise<void> {
  await db
    .delete(outboxEvents)
    .where(
      lt(outboxEvents.dispatchedAt, sql`now() - make_interval(days => ${KEEP_DISPATCHED_DAYS})`),
    );
}
