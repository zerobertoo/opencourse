/** Object keys of one uploaded video, all under `videos/<assetId>/`. */
export const videoKeys = {
  prefix: (assetId: string) => `videos/${assetId}/`,
  source: (assetId: string) => `videos/${assetId}/source`,
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

/** A rendition playlist with every segment replaced by the address `segmentUrl` returns for it. */
export async function rewriteRenditionPlaylist(
  playlist: string,
  segmentUrl: (file: string) => Promise<string>,
): Promise<string> {
  const lines = playlist.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
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
