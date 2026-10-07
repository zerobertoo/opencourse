import { normalizedHost, type VideoProviderPlugin } from '../types';

const NUMERIC_ID = /^\d{1,15}$/;
const PRIVACY_HASH = /^[0-9a-f]{6,32}$/i;

/**
 * Vimeo links, including unlisted ones that carry a privacy hash (`vimeo.com/ID/HASH` or
 * `player.vimeo.com/video/ID?h=HASH`). The identifier is stored as `ID` or `ID:HASH`.
 * Album, showcase, channel and group links hold another id before the video id, so only the
 * known shapes are read: `/channels/NAME/ID`, `/groups/NAME/videos/ID`, `/album/ID/video/ID`
 * and `/showcase/ID/video/ID`.
 */
export const vimeoPlugin: VideoProviderPlugin = {
  id: 'vimeo',
  label: 'Vimeo',
  match(url) {
    const host = normalizedHost(url);
    const segments = url.pathname.split('/').filter(Boolean);
    let id: string | undefined;
    let hash: string | null | undefined;
    if (host === 'player.vimeo.com' && segments[0] === 'video') {
      id = segments[1];
      hash = url.searchParams.get('h');
    } else if (host === 'vimeo.com') {
      const [first, second, third, fourth] = segments;
      if (first && NUMERIC_ID.test(first)) {
        id = first;
        hash = second;
      } else if (first === 'channels') {
        id = third;
      } else if (first === 'groups' && third === 'videos') {
        id = fourth;
      } else if ((first === 'album' || first === 'showcase') && third === 'video') {
        id = fourth;
      }
    }
    if (!id || !NUMERIC_ID.test(id)) return null;
    return { externalId: hash && PRIVACY_HASH.test(hash) ? `${id}:${hash}` : id };
  },
  embedUrl(externalId) {
    const [id, hash] = externalId.split(':');
    return `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`;
  },
};
