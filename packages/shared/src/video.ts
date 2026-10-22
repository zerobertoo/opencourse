import { z } from 'zod';
import { idSchema, isoDateSchema } from './base';
import { courseResponseSchema } from './courses';
import { localVideoAssetSchema } from './entities';

/** Largest file the upload endpoint accepts unless the instance sets `VIDEO_MAX_UPLOAD_BYTES`. */
export const DEFAULT_VIDEO_MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

/** Size of every upload part but the last (S3 requires at least 5 MiB). */
export const VIDEO_UPLOAD_PART_BYTES = 16 * 1024 ** 2;

/** Most parts one multipart upload can have (an S3 limit), which caps the size of a video. */
export const VIDEO_UPLOAD_MAX_PARTS = 10_000;

export const videoAssetParamsSchema = z.object({ assetId: idSchema });
/** `file` is `master.m3u8` or `<rendition>.m3u8`. */
export const videoPlaylistParamsSchema = z.object({
  assetId: idSchema,
  file: z.string().regex(/^[\w-]+\.m3u8$/),
});
export const videoPlaylistQuerySchema = z.object({ token: z.string().min(1).max(500) });

/** Asks for permission to upload a video file to a lesson. */
export const createVideoUploadRequestSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.string().regex(/^video\//, 'Only video files can be uploaded'),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type CreateVideoUploadRequest = z.infer<typeof createVideoUploadRequestSchema>;

/** One presigned address per part; the browser PUTs the matching slice of the file to each. */
export const createVideoUploadResponseSchema = z.object({
  assetId: idSchema,
  partSizeBytes: z.number().int().positive(),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), url: z.string() })).min(1),
});
export type CreateVideoUploadResponse = z.infer<typeof createVideoUploadResponseSchema>;

/** Sent after every part is uploaded; `etag` is the ETag header S3 answered each PUT with. */
export const completeVideoUploadRequestSchema = z
  .object({
    parts: z
      .array(
        z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) }).strict(),
      )
      .min(1)
      .max(VIDEO_UPLOAD_MAX_PARTS),
  })
  .strict();
export type CompleteVideoUploadRequest = z.infer<typeof completeVideoUploadRequestSchema>;

/**
 * Where to stream a ready video from: the API path of its master playlist, with a token that
 * expires, and a signed address of its poster frame (null for videos encoded without one).
 */
export const videoPlaybackResponseSchema = z.object({
  playbackUrl: z.string(),
  posterUrl: z.string().nullable(),
});
export type VideoPlaybackResponse = z.infer<typeof videoPlaybackResponseSchema>;

export const videoStatusResponseSchema = z.object({ video: localVideoAssetSchema });
export type VideoStatusResponse = z.infer<typeof videoStatusResponseSchema>;

/** The video now being processed, plus the course so the editor refreshes in one round trip. */
export const completeVideoUploadResponseSchema = courseResponseSchema.extend({
  video: localVideoAssetSchema,
});
export type CompleteVideoUploadResponse = z.infer<typeof completeVideoUploadResponseSchema>;

/** Raised by the worker once a video finished transcoding and can be played. */
export const videoProcessedEventSchema = z.object({
  assetId: idSchema,
  lessonId: idSchema,
  courseId: idSchema,
  durationSeconds: z.number().nonnegative(),
});
export type VideoProcessedEvent = z.infer<typeof videoProcessedEventSchema>;

/** A video the encoder gave up on, with where it lives so an admin can find its lesson. */
export const failedVideoSchema = z.object({
  assetId: idSchema,
  lessonId: idSchema,
  /** Titles are in the course's default language. */
  lessonTitle: z.string(),
  courseId: idSchema,
  courseTitle: z.string(),
  errorMessage: z.string().nullable(),
  failedAt: isoDateSchema,
  sizeBytes: z.number().int().nonnegative(),
});
export type FailedVideo = z.infer<typeof failedVideoSchema>;

/** The failed list shows this many videos; older failures wait until these are dealt with. */
export const FAILED_VIDEOS_LIMIT = 100;

/** The newest failures first. */
export const failedVideosResponseSchema = z.object({ videos: z.array(failedVideoSchema) });
export type FailedVideosResponse = z.infer<typeof failedVideosResponseSchema>;
