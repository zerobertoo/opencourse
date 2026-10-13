import { z } from 'zod';
import { idSchema, localeSchema } from './base';
import { fileAttachmentSchema } from './entities';
import { courseResponseSchema } from './courses';

/** Largest attachment accepted unless the instance sets `ATTACHMENT_MAX_BYTES`. */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 50 * 1024 ** 2;

/** Largest caption file; subtitles are plain text, so this is generous. */
export const CAPTION_MAX_BYTES = 1024 ** 2;

export const attachmentParamsSchema = z.object({ id: idSchema, attachmentId: idSchema });
export const attachmentDownloadParamsSchema = z.object({ id: idSchema });
export const captionParamsSchema = z.object({ id: idSchema, locale: localeSchema });
/** `file` is `<locale>.vtt`. */
export const captionFileParamsSchema = z.object({
  id: idSchema,
  file: z.string().regex(/^[A-Za-z-]+\.vtt$/),
});

/** Asks for permission to upload an attachment to a lesson. */
export const createAttachmentRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().min(1).max(255),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type CreateAttachmentRequest = z.infer<typeof createAttachmentRequestSchema>;

/** The browser PUTs the whole file to `uploadUrl`, then calls `complete`. */
export const createAttachmentResponseSchema = z.object({
  attachmentId: idSchema,
  uploadUrl: z.string(),
});
export type CreateAttachmentResponse = z.infer<typeof createAttachmentResponseSchema>;

/** The attachment now available, plus the course so the editor refreshes in one round trip. */
export const completeAttachmentResponseSchema = courseResponseSchema.extend({
  attachment: fileAttachmentSchema,
});
export type CompleteAttachmentResponse = z.infer<typeof completeAttachmentResponseSchema>;

/** Where to save an attachment from: a short-lived address that downloads instead of rendering. */
export const attachmentDownloadResponseSchema = z.object({ url: z.string() });
export type AttachmentDownloadResponse = z.infer<typeof attachmentDownloadResponseSchema>;

/** API path of an uploaded caption; the `url` of its entry in a lesson's captions. */
export function uploadedCaptionPath(lessonId: string, locale: string): string {
  return `/api/v1/lessons/${lessonId}/captions/${locale}.vtt`;
}

/** API path that downloads an attachment; the `url` of a lesson's attachment. */
export function attachmentDownloadPath(attachmentId: string): string {
  return `/api/v1/attachments/${attachmentId}/download`;
}

/**
 * Subtitle file bytes as text. A UTF-16 byte order mark wins; otherwise strict UTF-8, and bytes
 * that are not valid UTF-8 are read as Windows-1252, which is what old Latin-1 subtitle files are.
 */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

const SRT_TIMESTAMP = /(\d{1,2}:\d{2}:\d{2}),(\d{3})/g;
const VTT_CUE_TIMING = /\d{1,2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{1,2}:\d{2}(?::\d{2})?\.\d{3}/;

/**
 * Subtitle text as WebVTT, or null when it is neither WebVTT nor SRT. SRT is converted: the
 * `WEBVTT` header is added, timestamps use a dot instead of a comma and cue numbers are dropped.
 */
export function toWebVtt(input: string): string | null {
  const withoutBom = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const text = withoutBom.replace(/\r\n?/g, '\n');
  if (/^WEBVTT(?:[ \t\n]|$)/.test(text)) return text.endsWith('\n') ? text : `${text}\n`;

  const cues: string[] = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const timingAt = lines.findIndex((line) => line.includes('-->'));
    if (timingAt === -1) {
      // text that follows a blank line inside a cue; a lone number is the next cue's index
      const isCueNumber = lines.length === 1 && /^\d+$/.test(lines[0]!.trim());
      if (cues.length > 0 && lines.length > 0 && !isCueNumber) {
        cues[cues.length - 1] += `\n${lines.join('\n')}`;
      }
      continue;
    }
    const timing = (lines[timingAt] ?? '').replace(SRT_TIMESTAMP, '$1.$2');
    if (!VTT_CUE_TIMING.test(timing)) return null;
    cues.push([timing, ...lines.slice(timingAt + 1)].join('\n'));
  }
  if (cues.length === 0) return null;
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}
