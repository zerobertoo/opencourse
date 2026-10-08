import type { VideoProviderPlugin } from '../types';

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|m3u8)$/i;

/**
 * A direct https link to a video file (`.mp4`, `.webm`, `.mov`, `.m4v`) or an HLS playlist
 * (`.m3u8`), for videos you host yourself. It plays in the platform's own player, not in an
 * iframe, so no third-party page is embedded. The identifier is the address itself. Links with a
 * user name or password in them are refused, because they would be stored and shown in clear.
 */
export const directPlugin: VideoProviderPlugin = {
  id: 'direct',
  label: 'Video file (https link)',
  playback: 'file',
  match(url) {
    if (url.username || url.password) return null;
    return VIDEO_FILE.test(url.pathname) ? { externalId: url.toString() } : null;
  },
  embedUrl: (externalId) => externalId,
};
