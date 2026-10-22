import type { Queue } from 'bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { videoAssets } from '../../db/schema';
import type { Database } from '../../plugins/db';
import { addTranscodeJob, type JobData } from '../../worker/jobs';

/** A video `processing` for longer than this with no job in the queue lost its job. */
export const ORPHANED_JOB_MS = 10 * 60 * 1000;

/**
 * Queues the encode again for videos stuck in `processing` without a job, which happens when the
 * API stops between marking the upload finished and queueing it. Ones already waiting or running
 * are left alone, so a long encode is never doubled, and each row is claimed by touching its
 * `updatedAt` first, so two workers cannot both queue it. Returns how many jobs it added.
 */
export async function requeueOrphanedVideos(
  db: Database,
  queue: Queue<JobData>,
  now = new Date(),
): Promise<number> {
  const stuck = await db
    .select({ id: videoAssets.id, updatedAt: videoAssets.updatedAt })
    .from(videoAssets)
    .where(
      and(
        eq(videoAssets.status, 'processing'),
        lt(videoAssets.updatedAt, new Date(now.getTime() - ORPHANED_JOB_MS)),
      ),
    );
  if (stuck.length === 0) return 0;
  const queued = await queue.getJobs(['waiting', 'active', 'delayed', 'prioritized']);
  const queuedAssetIds = new Set(
    queued.map((job) => (job.data.payload as { assetId?: string } | null)?.assetId),
  );

  let added = 0;
  for (const { id, updatedAt } of stuck) {
    if (queuedAssetIds.has(id)) continue;
    // the claim: only one caller finds the row still untouched, and a video that finished or
    // changed meanwhile no longer matches
    const [claimed] = await db
      .update(videoAssets)
      .set({ updatedAt: now })
      .where(
        and(
          eq(videoAssets.id, id),
          eq(videoAssets.status, 'processing'),
          eq(videoAssets.updatedAt, updatedAt),
        ),
      )
      .returning({ id: videoAssets.id });
    if (!claimed) continue;
    // the first job may be finished or failed and still hold the fixed id
    await addTranscodeJob(queue, id, `transcode-video-${id}-${now.getTime()}`);
    added += 1;
  }
  return added;
}
