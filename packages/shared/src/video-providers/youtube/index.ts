import { normalizedHost, type VideoProviderPlugin } from '../types';

const VIDEO_ID = /^[\w-]{11}$/;

/** YouTube links: watch, short, embed, shorts and live. Embeds use the privacy-enhanced domain. */
export const youtubePlugin: VideoProviderPlugin = {
  id: 'youtube',
  label: 'YouTube',
  playback: 'embed',
  match(url) {
    const host = normalizedHost(url);
    const segments = url.pathname.split('/').filter(Boolean);
    let candidate: string | null | undefined = null;
    if (host === 'youtu.be') {
      candidate = segments[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') candidate = url.searchParams.get('v');
      else if (['embed', 'shorts', 'live'].includes(segments[0] ?? '')) candidate = segments[1];
    }
    return candidate && VIDEO_ID.test(candidate) ? { externalId: candidate } : null;
  },
  embedUrl: (externalId) => `https://www.youtube-nocookie.com/embed/${externalId}`,
};
