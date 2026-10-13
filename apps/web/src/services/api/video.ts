import { attachmentDownloadResponseSchema, videoPlaybackResponseSchema } from '@opencourse/shared';
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
    async getCaptionUrl(url) {
      if (!url.startsWith('/api/')) return url;
      return URL.createObjectURL(await client.blob(url));
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
