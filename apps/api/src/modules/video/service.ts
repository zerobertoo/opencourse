import { resolveVideoUrl, type ExternalVideoAsset, type LocalVideoAsset } from '@opencourse/shared';
import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  courses,
  lessons,
  modules,
  videoAssets,
  type CourseRow,
  type LessonRow,
  type VideoAssetRow,
} from '../../db/schema';
import type { Database } from '../../plugins/db';
import type { Storage } from '../../storage/s3';
import { videoKeys } from './playlist';

/** An upload that was never completed is dropped after this long. */
export const STALE_UPLOAD_MS = 24 * 3600 * 1000;

export function toLocalVideoAsset(row: VideoAssetRow): LocalVideoAsset {
  return {
    provider: 'local',
    assetId: row.id,
    status: row.status,
    errorMessage: row.errorMessage,
    durationSeconds: row.durationSeconds,
  };
}

/**
 * The external video of a lesson row. Rows saved before provider plugins hold the pasted address
 * in `externalId` and `playbackUrl` instead of `plugin` and `embedUrl`: those are resolved again
 * on read, and an address no plugin recognises (a bare video file, say) shows as no video.
 */
export function readExternalVideo(stored: ExternalVideoAsset | null): ExternalVideoAsset | null {
  if (!stored || stored.plugin) return stored;
  const legacy = stored as { externalId?: string; playbackUrl?: string };
  const resolved = resolveVideoUrl(legacy.playbackUrl ?? legacy.externalId ?? '');
  return resolved ? { provider: 'external', status: 'ready', ...resolved } : null;
}

export interface AssetContext {
  asset: VideoAssetRow;
  lesson: LessonRow;
  course: CourseRow;
}

/** The asset with the lesson and course it belongs to, or undefined. */
export async function findAssetContext(
  db: Pick<Database, 'select'>,
  assetId: string,
): Promise<AssetContext | undefined> {
  const [found] = await db
    .select({ asset: videoAssets, lesson: lessons, course: courses })
    .from(videoAssets)
    .innerJoin(lessons, eq(lessons.id, videoAssets.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(videoAssets.id, assetId));
  return found;
}

/** An uploaded video to clean up: its id and the multipart upload still open at the storage, if any. */
export interface VideoAssetRef {
  id: string;
  uploadId: string | null;
}

/** The uploaded videos in these lessons; read before a delete so the files can follow it. */
export async function videoAssetsOfLessons(
  db: Pick<Database, 'select'>,
  lessonIds: string[],
): Promise<VideoAssetRef[]> {
  if (lessonIds.length === 0) return [];
  return db
    .select({ id: videoAssets.id, uploadId: videoAssets.uploadId })
    .from(videoAssets)
    .where(inArray(videoAssets.lessonId, lessonIds));
}

/**
 * Deletes the stored files of these assets, and aborts an upload that never finished (its parts
 * are not objects, so deleting the prefix would not find them). Runs after the database change
 * committed, and a failure is only logged: the row is already gone, so a leftover file wastes
 * space but nothing else.
 */
export async function deleteVideoFiles(
  storage: Storage,
  assets: VideoAssetRef[],
  log: Pick<Logger, 'warn'>,
): Promise<void> {
  for (const { id: assetId, uploadId } of assets) {
    try {
      if (uploadId) await storage.abortMultipartUpload(videoKeys.source(assetId), uploadId);
      await storage.deletePrefix(videoKeys.prefix(assetId));
    } catch (error) {
      log.warn({ err: error, assetId }, 'could not delete the files of a removed video');
    }
  }
}

/** Drops uploads that sat unfinished for a day: aborts the multipart upload and removes the row. */
export async function removeStaleUploads(
  db: Database,
  storage: Storage,
  log: Pick<Logger, 'warn'>,
  now = new Date(),
): Promise<number> {
  const stale = await db
    .select()
    .from(videoAssets)
    .where(
      and(
        eq(videoAssets.status, 'uploading'),
        lt(videoAssets.createdAt, new Date(now.getTime() - STALE_UPLOAD_MS)),
      ),
    );
  for (const asset of stale) {
    try {
      if (asset.uploadId) {
        await storage.abortMultipartUpload(videoKeys.source(asset.id), asset.uploadId);
      }
    } catch (error) {
      // the upload may already be gone at the storage; the row is removed either way
      log.warn({ err: error, assetId: asset.id }, 'could not abort a stale upload');
    }
    await db.delete(videoAssets).where(eq(videoAssets.id, asset.id));
  }
  return stale.length;
}
