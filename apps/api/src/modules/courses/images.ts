import { uploadedBannerId, uploadedCoverId } from '@opencourse/shared';
import type { Logger } from 'pino';
import { courses } from '../../db/schema';
import type { Database } from '../../plugins/db';
import type { Storage } from '../../storage/s3';
import { STALE_UPLOAD_MS } from '../video/service';

const IMAGE_KEY = /^courses\/[^/]+\/(cover|banner)\/[^/]+$/;

/**
 * Deletes cover and banner files that no course points at and that are older than a day. A
 * presigned upload writes no row, so an upload that was never confirmed would otherwise stay in
 * the storage forever. A fresh file is kept: its owner may still be about to confirm it.
 * Returns how many files were deleted.
 */
export async function removeStaleCourseImages(
  db: Database,
  storage: Storage,
  log: Pick<Logger, 'warn'>,
  now = new Date(),
): Promise<number> {
  const rows = await db
    .select({ id: courses.id, cover: courses.coverImageUrl, banner: courses.bannerImageUrl })
    .from(courses);
  const referenced = new Set(
    rows.flatMap((row) => [
      `courses/${row.id}/cover/${uploadedCoverId(row.id, row.cover)}`,
      `courses/${row.id}/banner/${uploadedBannerId(row.id, row.banner)}`,
    ]),
  );
  const cutoff = now.getTime() - STALE_UPLOAD_MS;

  let removed = 0;
  for (const { key, lastModified } of await storage.listObjects('courses/')) {
    if (!IMAGE_KEY.test(key) || referenced.has(key) || lastModified.getTime() > cutoff) continue;
    try {
      await storage.deleteObject(key);
      removed += 1;
    } catch (error) {
      log.warn({ err: error, key }, 'could not delete an abandoned course image');
    }
  }
  return removed;
}
