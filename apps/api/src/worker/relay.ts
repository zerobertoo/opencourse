import { asc, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import { outboxEvents, webhookDeliveries } from '../db/schema';
import type { Database } from '../plugins/db';
import { consumers } from './consumers';
import { jobOptions, type JobData } from './jobs';

const BATCH_SIZE = 100;
const KEEP_DISPATCHED_DAYS = 7;

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
      for (const consumer of consumers.filter((candidate) => candidate.events.includes(row.name))) {
        await queue.add(
          consumer.name,
          {
            eventId: row.id,
            eventName: row.name,
            eventCreatedAt: row.createdAt.toISOString(),
            payload: row.payload,
          },
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

/** Deletes events and webhook deliveries older than a week (events: since dispatch). */
export async function purgeDispatchedEvents(db: Database): Promise<void> {
  const cutoff = sql`now() - make_interval(days => ${KEEP_DISPATCHED_DAYS})`;
  await db.delete(outboxEvents).where(lt(outboxEvents.dispatchedAt, cutoff));
  await db.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, cutoff));
}
