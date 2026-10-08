import { normalizedHost, type VideoProviderPlugin } from '../types';

const VIDEO_ID = /^[0-9a-f]{32}$/i;

/**
 * Cloudflare Stream links: `iframe.videodelivery.net/ID`, `watch.cloudflarestream.com/ID` and the
 * per-account `customer-XXXX.cloudflarestream.com/ID/(watch|iframe)` form.
 */
export const cloudflarePlugin: VideoProviderPlugin = {
  id: 'cloudflare',
  label: 'Cloudflare Stream',
  playback: 'embed',
  match(url) {
    const host = normalizedHost(url);
    const isStreamHost =
      host === 'iframe.videodelivery.net' ||
      host === 'watch.cloudflarestream.com' ||
      /^customer-[a-z0-9]+\.cloudflarestream\.com$/.test(host);
    if (!isStreamHost) return null;
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id && VIDEO_ID.test(id) ? { externalId: id.toLowerCase() } : null;
  },
  embedUrl: (externalId) => `https://iframe.videodelivery.net/${externalId}`,
};
