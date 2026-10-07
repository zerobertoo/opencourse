import { normalizedHost, type VideoProviderPlugin } from '../types';

const NUMERIC_ID = /^\d{1,12}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Bunny Stream links: `iframe.mediadelivery.net/embed|play/LIBRARY_ID/VIDEO_GUID`. */
export const bunnyPlugin: VideoProviderPlugin = {
  id: 'bunny',
  label: 'Bunny Stream',
  match(url) {
    if (normalizedHost(url) !== 'iframe.mediadelivery.net') return null;
    const [kind, library, video] = url.pathname.split('/').filter(Boolean);
    if (kind !== 'embed' && kind !== 'play') return null;
    if (!library || !video || !NUMERIC_ID.test(library) || !GUID.test(video)) return null;
    return { externalId: `${library}/${video.toLowerCase()}` };
  },
  embedUrl: (externalId) => `https://iframe.mediadelivery.net/embed/${externalId}`,
};
