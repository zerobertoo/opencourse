import type { VideoProviderPlugin } from '../types';

const PLAYER_HOST = /^player-vz-[a-z0-9-]+\.tv\.pandavideo\.com(\.br)?$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Panda Video player links: `player-vz-XXXX.tv.pandavideo.com.br/embed/?v=VIDEO_GUID`. The
 * identifier is `PLAYER_HOST/VIDEO_GUID`, so the embed keeps the domain the link came with.
 */
export const pandaPlugin: VideoProviderPlugin = {
  id: 'panda',
  label: 'Panda Video',
  playback: 'embed',
  match(url) {
    const host = url.hostname.toLowerCase();
    const video = url.searchParams.get('v');
    if (!PLAYER_HOST.test(host) || !video || !GUID.test(video)) return null;
    return { externalId: `${host}/${video.toLowerCase()}` };
  },
  embedUrl(externalId) {
    const [host, video] = externalId.split('/');
    return `https://${host}/embed/?v=${video}`;
  },
};
