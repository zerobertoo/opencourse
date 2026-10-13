import {
  attachmentDownloadPath,
  uploadedCaptionPath,
  type FileAttachment,
} from '@opencourse/shared';
import { and, eq, lt } from 'drizzle-orm';
import type { Logger } from 'pino';
import {
  courses,
  lessonAttachments,
  lessons,
  modules,
  type CourseRow,
  type LessonAttachmentRow,
  type LessonRow,
} from '../../db/schema';
import type { Database } from '../../plugins/db';
import type { Storage } from '../../storage/s3';
import { STALE_UPLOAD_MS } from '../video/service';

/** Object keys of the files of one lesson, all under `lessons/<lessonId>/`. */
export const lessonFileKeys = {
  prefix: (lessonId: string) => `lessons/${lessonId}/`,
  attachment: (lessonId: string, attachmentId: string) =>
    `lessons/${lessonId}/attachments/${attachmentId}`,
  caption: (lessonId: string, locale: string) => `lessons/${lessonId}/captions/${locale}.vtt`,
};

/** How long the address to send an attachment to, or to download one from, stays valid. */
export const ATTACHMENT_UPLOAD_TTL_SECONDS = 3600;
export const ATTACHMENT_DOWNLOAD_TTL_SECONDS = 300;

export function toFileAttachment(row: LessonAttachmentRow): FileAttachment {
  return {
    id: row.id,
    name: row.name,
    sizeBytes: row.sizeBytes,
    url: attachmentDownloadPath(row.id),
  };
}

/** The file name as stored: no directories, no control characters, and never empty. */
export function cleanFileName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = (raw.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return name === '' ? 'file' : name.slice(0, 255);
}

/**
 * `Content-Disposition` that makes the browser save the file instead of showing it. The plain
 * `filename` is an ASCII fallback; `filename*` carries the real name.
 */
export function attachmentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]|["\\%;]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

export interface AttachmentContext {
  attachment: LessonAttachmentRow;
  lesson: LessonRow;
  course: CourseRow;
}

/** The attachment with the lesson and course it belongs to, or undefined. */
export async function findAttachmentContext(
  db: Pick<Database, 'select'>,
  attachmentId: string,
): Promise<AttachmentContext | undefined> {
  const [found] = await db
    .select({ attachment: lessonAttachments, lesson: lessons, course: courses })
    .from(lessonAttachments)
    .innerJoin(lessons, eq(lessons.id, lessonAttachments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(eq(lessonAttachments.id, attachmentId));
  return found;
}

/** An attachment of a lesson, but only when it belongs to that lesson. */
export async function findLessonAttachment(
  db: Pick<Database, 'select'>,
  lessonId: string,
  attachmentId: string,
): Promise<LessonAttachmentRow | undefined> {
  const [row] = await db
    .select()
    .from(lessonAttachments)
    .where(and(eq(lessonAttachments.id, attachmentId), eq(lessonAttachments.lessonId, lessonId)));
  return row;
}

/**
 * Deletes the stored caption files of these languages unless a caption entry points at them again.
 * Runs after the change that dropped them committed, under the course lock like every caption
 * change: captions uploaded meanwhile have their file and entry written under that same lock, so
 * the check cannot see an entry whose file is about to be deleted. A failure is only logged.
 */
export async function deleteUnreferencedCaptionFiles(
  db: Database,
  storage: Storage,
  courseId: string,
  lessonId: string,
  locales: string[],
  log: Pick<Logger, 'warn'>,
): Promise<void> {
  if (locales.length === 0) return;
  try {
    await db.transaction(async (tx) => {
      await tx
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, courseId))
        .for('update');
      const [current] = await tx
        .select({ captions: lessons.captions })
        .from(lessons)
        .where(eq(lessons.id, lessonId));
      const stillUploaded = new Set<string>(
        (current?.captions ?? [])
          .filter((item) => item.url === uploadedCaptionPath(lessonId, item.locale))
          .map((item) => item.locale),
      );
      for (const locale of locales) {
        if (stillUploaded.has(locale)) continue;
        await storage.deleteObject(lessonFileKeys.caption(lessonId, locale));
      }
    });
  } catch (error) {
    log.warn({ err: error, lessonId }, 'could not delete caption files');
  }
}

/**
 * Deletes every stored file of these lessons (attachments and captions). Runs after the database
 * change committed, and a failure is only logged: the rows are already gone, so a leftover file
 * wastes space but nothing else.
 */
export async function deleteLessonFiles(
  storage: Storage,
  lessonIds: string[],
  log: Pick<Logger, 'warn'>,
): Promise<void> {
  for (const lessonId of lessonIds) {
    try {
      await storage.deletePrefix(lessonFileKeys.prefix(lessonId));
    } catch (error) {
      log.warn({ err: error, lessonId }, 'could not delete the files of a removed lesson');
    }
  }
}

/**
 * Drops attachments whose upload was never confirmed within a day: removes the row and whatever
 * reached the storage. Returns how many were dropped.
 */
export async function removeStaleAttachments(
  db: Database,
  storage: Storage,
  log: Pick<Logger, 'warn'>,
  now = new Date(),
): Promise<number> {
  const stale = await db
    .select()
    .from(lessonAttachments)
    .where(
      and(
        eq(lessonAttachments.status, 'uploading'),
        lt(lessonAttachments.createdAt, new Date(now.getTime() - STALE_UPLOAD_MS)),
      ),
    );
  for (const row of stale) {
    try {
      await storage.deleteObject(lessonFileKeys.attachment(row.lessonId, row.id));
    } catch (error) {
      log.warn({ err: error, attachmentId: row.id }, 'could not delete a stale attachment file');
    }
    await db.delete(lessonAttachments).where(eq(lessonAttachments.id, row.id));
  }
  return stale.length;
}
