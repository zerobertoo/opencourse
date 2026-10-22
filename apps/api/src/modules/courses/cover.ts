import { uploadedCoverId } from '@opencourse/shared';
import type { Logger } from 'pino';
import type { Storage } from '../../storage/s3';

/** Object key of an uploaded cover, all under `courses/<courseId>/cover/`. */
export const coverFileKey = (courseId: string, coverId: string) =>
  `courses/${courseId}/cover/${coverId}`;

/** How long the address to send a cover to, or to read one from, stays valid. */
export const COVER_UPLOAD_TTL_SECONDS = 900;
export const COVER_READ_TTL_SECONDS = 300;

/**
 * Deletes the file behind a cover address that was just replaced or removed. Does nothing for a
 * link to somewhere else. A failure is only logged: the course already points elsewhere, so the
 * file is a leftover, not a fault.
 */
export async function deleteReplacedCover(
  storage: Storage,
  courseId: string,
  previousUrl: string | null,
  log: Logger | { warn: (...args: unknown[]) => void },
): Promise<void> {
  const coverId = uploadedCoverId(courseId, previousUrl);
  if (!coverId) return;
  await storage
    .deleteObject(coverFileKey(courseId, coverId))
    .catch((error: unknown) => log.warn({ err: error, courseId }, 'could not delete a cover file'));
}
