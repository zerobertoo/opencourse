import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { lessons, videoAssets } from '../../db/schema';
import { enqueueEvents } from '../../outbox';
import type { Database } from '../../plugins/db';
import type { Storage } from '../../storage/s3';
import { videoKeys } from './playlist';
import { findAssetContext } from './service';
import { transcodeVideo, UnreadableVideoError } from './transcode';

const GENERIC_FAILURE = 'The video could not be processed. Try uploading it again.';

async function markFailed(db: Database, assetId: string, message: string): Promise<void> {
  await db
    .update(videoAssets)
    .set({ status: 'error', errorMessage: message, updatedAt: new Date() })
    .where(eq(videoAssets.id, assetId));
}

/**
 * Runs the `transcode-video` job: encodes an uploaded source to HLS, then marks the asset ready
 * and records `video.processed`. A file that cannot be read fails for good without retrying;
 * other errors are rethrown so the queue retries, and the last attempt leaves the asset in `error`.
 */
export async function processVideo(
  db: Database,
  storage: Storage,
  assetId: string,
  isLastAttempt: boolean,
  log: Pick<Logger, 'warn'>,
): Promise<void> {
  const context = await findAssetContext(db, assetId);
  // deleted or replaced while it waited, or already done by an earlier attempt
  if (context?.asset.status !== 'processing') return;

  const workDir = await mkdtemp(path.join(tmpdir(), 'opencourse-video-'));
  try {
    const result = await transcodeVideo(storage, assetId, workDir);
    const committed = await db.transaction(async (tx) => {
      // the video may have been replaced or deleted while it encoded: only a still-processing
      // asset is finished, and then nothing else is touched
      const [finished] = await tx
        .update(videoAssets)
        .set({
          status: 'ready',
          errorMessage: null,
          durationSeconds: result.durationSeconds,
          renditions: result.renditions,
          updatedAt: new Date(),
        })
        .where(and(eq(videoAssets.id, assetId), eq(videoAssets.status, 'processing')))
        .returning({ id: videoAssets.id });
      if (!finished) return false;
      await tx
        .update(lessons)
        .set({ durationSeconds: result.durationSeconds })
        .where(eq(lessons.id, context.lesson.id));
      await enqueueEvents(tx, [
        {
          name: 'video.processed',
          payload: {
            assetId,
            lessonId: context.lesson.id,
            courseId: context.course.id,
            durationSeconds: result.durationSeconds,
          },
        },
      ]);
      return true;
    });
    // the encoded renditions replace the source, which would otherwise double the disk use; an
    // asset that vanished meanwhile leaves its new files behind, which are removed with it. A
    // storage hiccup here only wastes space, so it never turns a finished video into an error.
    await storage
      .deletePrefix(committed ? videoKeys.source(assetId) : videoKeys.prefix(assetId))
      .catch((cleanupError: unknown) =>
        log.warn({ err: cleanupError, assetId }, 'could not delete files after encoding'),
      );
  } catch (error) {
    if (error instanceof UnreadableVideoError) {
      await markFailed(db, assetId, error.message);
      return;
    }
    if (isLastAttempt) await markFailed(db, assetId, GENERIC_FAILURE);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
