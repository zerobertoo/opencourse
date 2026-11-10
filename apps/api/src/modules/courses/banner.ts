import { uploadedBannerId } from '@opencourse/shared';
import type { Logger } from 'pino';
import type { Storage } from '../../storage/s3';

export const bannerFileKey = (courseId: string, bannerId: string) =>
  `courses/${courseId}/banner/${bannerId}`;

export const BANNER_UPLOAD_TTL_SECONDS = 900;
export const BANNER_READ_TTL_SECONDS = 300;

/** Deletes the file behind a banner address that was just replaced or removed; a failure is only logged. */
export async function deleteReplacedBanner(
  storage: Storage,
  courseId: string,
  previousUrl: string | null,
  log: Logger | { warn: (...args: unknown[]) => void },
): Promise<void> {
  const bannerId = uploadedBannerId(courseId, previousUrl);
  if (!bannerId) return;
  await storage
    .deleteObject(bannerFileKey(courseId, bannerId))
    .catch((error: unknown) =>
      log.warn({ err: error, courseId }, 'could not delete a banner file'),
    );
}
