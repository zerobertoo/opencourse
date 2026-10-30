import {
  attachmentDownloadResponseSchema,
  failedVideosResponseSchema,
  streamHeartbeatResponseSchema,
  videoPlaybackResponseSchema,
  videoStatusResponseSchema,
} from '@opencourse/shared';
import type { VideoService } from '../video';
import type { ApiClient } from './client';

export function createApiVideoService(client: ApiClient): VideoService {
  return {
    async getPlayback(assetId) {
      const { playbackUrl, posterUrl } = await client.request(
        'GET',
        `/videos/${encodeURIComponent(assetId)}/playback`,
        { schema: videoPlaybackResponseSchema },
      );
      // the API answers with a path; the player needs the full address
      return { url: client.absoluteUrl(playbackUrl), posterUrl };
    },
    async reportPlayback(assetId, event, options) {
      try {
        const { active } = await client.request(
          'POST',
          `/videos/${encodeURIComponent(assetId)}/heartbeat`,
          { body: { event }, schema: streamHeartbeatResponseSchema, keepalive: options?.keepalive },
        );
        return active;
      } catch {
        // the report is a courtesy to the other devices: failing to send it must not stop the video
        return true;
      }
    },
    async getCaptionUrl(url) {
      if (!url.startsWith('/api/')) return url;
      return URL.createObjectURL(await client.blob(url));
    },
    async listFailed() {
      const { videos } = await client.request('GET', '/admin/videos/failed', {
        schema: failedVideosResponseSchema,
      });
      return videos;
    },
    async retry(assetId) {
      const { video } = await client.request(
        'POST',
        `/admin/videos/${encodeURIComponent(assetId)}/retry`,
        { schema: videoStatusResponseSchema },
      );
      return video;
    },
    async getDownloadUrl(path) {
      if (!path.startsWith('/api/')) return path;
      const { url } = await client.request('GET', path.replace(/^\/api\/v1/, ''), {
        schema: attachmentDownloadResponseSchema,
      });
      return url;
    },
  };
}
