import {
  VIDEO_UPLOAD_PART_BYTES,
  completeVideoUploadRequestSchema,
  completeVideoUploadResponseSchema,
  createVideoUploadRequestSchema,
  createVideoUploadResponseSchema,
  lessonIdParamsSchema,
  videoAssetParamsSchema,
  videoPlaybackResponseSchema,
  videoPlaylistParamsSchema,
  videoPlaylistQuerySchema,
  videoStatusResponseSchema,
} from '@opencourse/shared';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Config } from '../../config';
import { lessons, users, videoAssets } from '../../db/schema';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../errors';
import {
  DEFAULT_QUEUE_PREFIX,
  DEFAULT_RETRY_DELAY_MS,
  jobOptions,
  VIDEO_QUEUE_NAME,
  type JobData,
} from '../../worker/jobs';
import { requireManagedCourse, resolveCourseAccess } from '../courses/access';
import { changeCurriculum, findCourseOfLesson } from '../courses/curriculum';
import { loadCourseDetail } from '../courses/detail';
import {
  PLAYBACK_TOKEN_TTL_SECONDS,
  signPlaybackToken,
  verifyPlaybackToken,
} from './playback-token';
import {
  RENDITION_NAME,
  rewriteMasterPlaylist,
  rewriteRenditionPlaylist,
  videoKeys,
} from './playlist';
import {
  deleteVideoFiles,
  findAssetContext,
  toLocalVideoAsset,
  videoAssetIdsOfLessons,
} from './service';

const PLAYLIST_CONTENT_TYPE = 'application/vnd.apple.mpegurl';
/** Time a browser has to start uploading each part. */
const UPLOAD_URL_TTL_SECONDS = 6 * 3600;
/** Segment addresses last at least this long, so a player that paused keeps working. */
const MIN_SEGMENT_URL_TTL_SECONDS = 3600;

export interface VideoRoutesOptions {
  config: Config;
  /** Isolates the queue keys; must match the worker's. Tests give each file its own. */
  queuePrefix?: string | undefined;
}

export const videoRoutes: FastifyPluginAsyncZod<VideoRoutesOptions> = async (
  app,
  { config, queuePrefix },
) => {
  // the API only adds transcode jobs to the worker's queue, so it connects on first use
  let queue: Queue<JobData> | undefined;
  const getQueue = () =>
    (queue ??= new Queue<JobData>(VIDEO_QUEUE_NAME, {
      connection: app.redis,
      prefix: queuePrefix ?? DEFAULT_QUEUE_PREFIX,
    }));
  app.addHook('onClose', async () => {
    await queue?.close();
  });

  /** A video lesson the caller may edit; invisible and unknown lessons look the same. */
  async function managedVideoLesson(request: FastifyRequest, lessonId: string) {
    const found = await findCourseOfLesson(app.db, lessonId);
    const course = await requireManagedCourse(
      app.db,
      request.auth!.user,
      found?.course,
      'Lesson not found',
    );
    if (found!.lesson.type !== 'video') throw badRequest('Only video lessons have a video');
    return { course, lesson: found!.lesson };
  }

  app.post(
    '/lessons/:id/video/upload',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['video'],
        summary: 'Start uploading a video file to a lesson',
        description:
          'Replaces any video the lesson has, unless that would leave a published course without a ready video. PUT each slice of the file to its address, then call /video/complete.',
        params: lessonIdParamsSchema,
        body: createVideoUploadRequestSchema,
        response: { 200: createVideoUploadResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedVideoLesson(request, request.params.id);
      const { filename, contentType, sizeBytes } = request.body;
      if (sizeBytes > config.VIDEO_MAX_UPLOAD_BYTES) {
        throw badRequest(`Videos can be at most ${config.VIDEO_MAX_UPLOAD_BYTES} bytes`, {
          maxBytes: config.VIDEO_MAX_UPLOAD_BYTES,
        });
      }

      // the storage upload comes first, so a failure there leaves nothing half-created in the database
      const assetId = randomUUID();
      const key = videoKeys.source(assetId);
      const uploadId = await app.storage.startMultipartUpload(key, contentType);

      // Under the course lock, like every curriculum edit: two uploads to one lesson queue up, and
      // swapping a ready video for one that is not ready yet is refused on a published course.
      let replacedIds: string[] = [];
      try {
        await changeCurriculum(app.db, course.id, { checkPublish: true }, async (tx) => {
          replacedIds = await videoAssetIdsOfLessons(tx, [lesson.id]);
          await tx.delete(videoAssets).where(eq(videoAssets.lessonId, lesson.id));
          await tx.update(lessons).set({ video: null }).where(eq(lessons.id, lesson.id));
          await tx
            .insert(videoAssets)
            .values({ id: assetId, lessonId: lesson.id, sizeBytes, uploadId });
        });
      } catch (error) {
        await app.storage
          .abortMultipartUpload(key, uploadId)
          .catch((abortError: unknown) =>
            request.log.warn({ err: abortError, assetId }, 'could not abort a refused upload'),
          );
        throw error;
      }
      await deleteVideoFiles(app.storage, replacedIds, request.log);

      const partCount = Math.max(1, Math.ceil(sizeBytes / VIDEO_UPLOAD_PART_BYTES));
      const parts = await Promise.all(
        Array.from({ length: partCount }, async (_, index) => ({
          partNumber: index + 1,
          url: await app.storage.presignUploadPart(
            key,
            uploadId,
            index + 1,
            UPLOAD_URL_TTL_SECONDS,
          ),
        })),
      );
      request.log.info({ assetId, filename, sizeBytes, partCount }, 'video upload started');
      return { assetId, partSizeBytes: VIDEO_UPLOAD_PART_BYTES, parts };
    },
  );

  app.post(
    '/lessons/:id/video/complete',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['video'],
        summary: 'Finish a video upload and start processing it',
        params: lessonIdParamsSchema,
        body: completeVideoUploadRequestSchema,
        response: { 200: completeVideoUploadResponseSchema },
      },
    },
    async (request) => {
      const { course, lesson } = await managedVideoLesson(request, request.params.id);
      const [asset] = await app.db
        .select()
        .from(videoAssets)
        .where(eq(videoAssets.lessonId, lesson.id));
      if (asset?.status !== 'uploading' || !asset.uploadId) {
        throw conflict('There is no upload in progress for this lesson');
      }

      const key = videoKeys.source(asset.id);
      await app.storage.completeMultipartUpload(key, asset.uploadId, request.body.parts);
      const stored = await app.storage.sizeOf(key);
      if (stored !== asset.sizeBytes) {
        await deleteVideoFiles(app.storage, [asset.id], request.log);
        await app.db
          .update(videoAssets)
          .set({
            status: 'error',
            uploadId: null,
            errorMessage: 'The file that arrived is not the size announced. Upload it again.',
            updatedAt: new Date(),
          })
          .where(eq(videoAssets.id, asset.id));
        throw badRequest('The uploaded file does not match the announced size');
      }

      const [updated] = await app.db
        .update(videoAssets)
        .set({ status: 'processing', uploadId: null, errorMessage: null, updatedAt: new Date() })
        .where(eq(videoAssets.id, asset.id))
        .returning();
      await getQueue().add(
        'transcode-video',
        {
          eventId: asset.id,
          eventName: 'video.upload',
          eventCreatedAt: new Date().toISOString(),
          payload: { assetId: asset.id },
        },
        {
          ...jobOptions(DEFAULT_RETRY_DELAY_MS),
          attempts: 2,
          jobId: `transcode-video-${asset.id}`,
        },
      );
      return { video: toLocalVideoAsset(updated!), course: await loadCourseDetail(app.db, course) };
    },
  );

  app.get(
    '/videos/:assetId/status',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['video'],
        summary: 'Processing status of an uploaded video',
        params: videoAssetParamsSchema,
        response: { 200: videoStatusResponseSchema },
      },
    },
    async (request) => {
      const context = await findAssetContext(app.db, request.params.assetId);
      await requireManagedCourse(app.db, request.auth!.user, context?.course, 'Video not found');
      return { video: toLocalVideoAsset(context!.asset) };
    },
  );

  app.get(
    '/videos/:assetId/playback',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['video'],
        summary: 'Address to stream a ready video from',
        description:
          'The address carries a token that expires; every playlist request checks the access again.',
        params: videoAssetParamsSchema,
        response: { 200: videoPlaybackResponseSchema },
      },
    },
    async (request) => {
      const user = request.auth!.user;
      const context = await findAssetContext(app.db, request.params.assetId);
      if (!context) throw notFound('Video not found');
      const access = await resolveCourseAccess(app.db, user, context.course, new Date());
      if (!access.isVisible) throw notFound('Video not found');
      if (!access.canViewContent) throw forbidden('Access to this course requires a grant');
      if (context.asset.status !== 'ready') throw conflict('The video is not ready yet');

      const token = signPlaybackToken(
        config.AUTH_SECRET,
        { assetId: context.asset.id, userId: user.id },
        PLAYBACK_TOKEN_TTL_SECONDS,
        new Date(),
      );
      return { playbackUrl: playlistPath(context.asset.id, 'master', token) };
    },
  );

  app.get(
    '/videos/:assetId/:file',
    {
      // the token in the address is the credential: players cannot send cookies to every request
      schema: {
        tags: ['video'],
        summary: 'HLS playlist of a ready video',
        params: videoPlaylistParamsSchema,
        querystring: videoPlaylistQuerySchema,
      },
    },
    async (request, reply) => {
      const { assetId, file } = request.params;
      const { token } = request.query;
      const claims = verifyPlaybackToken(config.AUTH_SECRET, token, new Date());
      if (claims?.assetId !== assetId) throw unauthorized('Invalid or expired playback address');

      const [user] = await app.db.select().from(users).where(eq(users.id, claims.userId));
      if (!user?.active) throw unauthorized('Invalid or expired playback address');
      const context = await findAssetContext(app.db, assetId);
      if (!context) throw notFound('Video not found');
      const access = await resolveCourseAccess(app.db, user, context.course, new Date());
      if (!access.isVisible || !access.canViewContent) {
        throw forbidden('Access to this course requires a grant');
      }
      if (context.asset.status !== 'ready') throw conflict('The video is not ready yet');

      const name = file.slice(0, -'.m3u8'.length);
      let body: string;
      if (name === 'master') {
        const master = await app.storage.readText(videoKeys.masterPlaylist(assetId));
        body = rewriteMasterPlaylist(master, (rendition) =>
          playlistPath(assetId, rendition, token),
        );
      } else {
        if (!RENDITION_NAME.test(name) || !context.asset.renditions.includes(name)) {
          throw notFound('Rendition not found');
        }
        const playlist = await app.storage.readText(videoKeys.renditionPlaylist(assetId, name));
        const ttl = Math.max(MIN_SEGMENT_URL_TTL_SECONDS, (context.asset.durationSeconds ?? 0) * 2);
        body = await rewriteRenditionPlaylist(playlist, (segment) =>
          app.storage.presignGet(videoKeys.segment(assetId, name, segment), ttl),
        );
      }
      return reply
        .header('content-type', PLAYLIST_CONTENT_TYPE)
        .header('cache-control', 'private, no-store')
        .send(body);
    },
  );
};

/** API path of a playlist, relative to the API origin. */
function playlistPath(assetId: string, name: string, token: string): string {
  return `/api/v1/videos/${assetId}/${name}.m3u8?token=${encodeURIComponent(token)}`;
}
