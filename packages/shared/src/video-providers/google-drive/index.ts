import { normalizedHost, type VideoProviderPlugin } from '../types';

const FILE_ID = /^[A-Za-z0-9_-]{20,}$/;

/**
 * Google Drive share links: `drive.google.com/file/d/FILE_ID/view`, with or without `?usp=...`.
 * The file must be shared as "anyone with the link"; the embed uses Drive's own preview player.
 */
export const googleDrivePlugin: VideoProviderPlugin = {
  id: 'google-drive',
  label: 'Google Drive',
  playback: 'embed',
  match(url) {
    if (normalizedHost(url) !== 'drive.google.com') return null;
    // also accepts the `/file/u/0/d/` form Drive adds when several accounts are signed in
    const fileId = /^\/file\/(?:u\/\d+\/)?d\/([^/]+)(?:\/|$)/.exec(url.pathname)?.[1];
    if (!fileId || !FILE_ID.test(fileId)) return null;
    return { externalId: fileId };
  },
  embedUrl(externalId) {
    return `https://drive.google.com/file/d/${externalId}/preview`;
  },
};
