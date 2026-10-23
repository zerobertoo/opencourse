/** Object keys of one uploaded video, all under `videos/<assetId>/`. */
export const videoKeys = {
  prefix: (assetId: string) => `videos/${assetId}/`,
  source: (assetId: string) => `videos/${assetId}/source`,
  poster: (assetId: string) => `videos/${assetId}/poster.jpg`,
  /** AES-128 key of the segments, as 32 hex characters. Videos encoded before encryption have none. */
  encryptionKey: (assetId: string) => `videos/${assetId}/hls/key.bin`,
  masterPlaylist: (assetId: string) => `videos/${assetId}/hls/master.m3u8`,
  renditionPlaylist: (assetId: string, rendition: string) =>
    `videos/${assetId}/hls/${rendition}/index.m3u8`,
  segment: (assetId: string, rendition: string, file: string) =>
    `videos/${assetId}/hls/${rendition}/${file}`,
};

/** Rendition names are heights such as `720p` or `64p`; anything else never reaches a storage key. */
export const RENDITION_NAME = /^\d{1,4}p$/;

/** The lines of a playlist that are addresses (everything but blank lines and `#` tags). */
function mapUriLines(playlist: string, map: (uri: string) => string): string {
  return playlist
    .split(/\r?\n/)
    .map((line) => (line.trim() === '' || line.startsWith('#') ? line : map(line.trim())))
    .join('\n');
}

/**
 * The master playlist with every variant pointing at the API, so each rendition playlist is
 * requested through the access check. `variantUrl` receives the rendition name (`720p`).
 */
export function rewriteMasterPlaylist(
  playlist: string,
  variantUrl: (rendition: string) => string,
): string {
  return mapUriLines(playlist, (uri) => {
    const rendition = uri.split('/')[0] ?? '';
    if (!RENDITION_NAME.test(rendition)) throw new Error(`Unexpected variant in playlist: ${uri}`);
    return variantUrl(rendition);
  });
}

/** What the encoder writes as the key address; the API swaps it for the real one when serving. */
export const KEY_PLACEHOLDER = 'key.bin';

/**
 * A rendition playlist with every segment replaced by the address `segmentUrl` returns for it,
 * and the encryption key address (when the playlist has one) replaced by `keyUrl()`.
 */
export async function rewriteRenditionPlaylist(
  playlist: string,
  segmentUrl: (file: string) => Promise<string>,
  keyUrl?: () => string,
): Promise<string> {
  const lines = playlist.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#EXT-X-KEY:')) {
      // only the placeholder is ever written, so any other address came from somewhere else
      if (!keyUrl || !line.includes(`URI="${KEY_PLACEHOLDER}"`)) {
        throw new Error(`Unexpected key in playlist: ${line}`);
      }
      out.push(line.replace(`URI="${KEY_PLACEHOLDER}"`, `URI="${keyUrl()}"`));
      continue;
    }
    if (line.trim() === '' || line.startsWith('#')) {
      out.push(line);
      continue;
    }
    // segments sit next to the playlist; a path would let a crafted playlist reach other keys
    const file = line.trim();
    if (file.includes('/') || file.includes('..')) {
      throw new Error(`Unexpected segment in playlist: ${file}`);
    }
    out.push(await segmentUrl(file));
  }
  return out.join('\n');
}
