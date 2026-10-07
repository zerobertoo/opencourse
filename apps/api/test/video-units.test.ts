import { describe, expect, it } from 'vitest';
import { signPlaybackToken, verifyPlaybackToken } from '../src/modules/video/playback-token';
import { rewriteMasterPlaylist, rewriteRenditionPlaylist } from '../src/modules/video/playlist';
import { buildMasterPlaylist, chooseRenditions } from '../src/modules/video/transcode';

const SECRET = 'a-secret-with-at-least-thirty-two-characters';
const CLAIMS = { assetId: 'asset-1', userId: 'user-1' };
const NOW = new Date('2026-01-01T00:00:00Z');

describe('playback token', () => {
  it('round-trips its claims until it expires', () => {
    const token = signPlaybackToken(SECRET, CLAIMS, 60, NOW);
    expect(verifyPlaybackToken(SECRET, token, NOW)).toEqual(CLAIMS);
    expect(verifyPlaybackToken(SECRET, token, new Date(NOW.getTime() + 59_000))).toEqual(CLAIMS);
    expect(verifyPlaybackToken(SECRET, token, new Date(NOW.getTime() + 60_000))).toBeNull();
  });

  it('rejects a token with another secret, tampered claims or the wrong shape', () => {
    const token = signPlaybackToken(SECRET, CLAIMS, 60, NOW);
    expect(
      verifyPlaybackToken('another-secret-with-thirty-two-characters!', token, NOW),
    ).toBeNull();
    expect(verifyPlaybackToken(SECRET, token.replace('asset-1', 'asset-2'), NOW)).toBeNull();
    expect(verifyPlaybackToken(SECRET, 'v1.session.123.signature', NOW)).toBeNull();
    expect(verifyPlaybackToken(SECRET, '', NOW)).toBeNull();
  });
});

describe('playlist rewriting', () => {
  it('points every variant of the master playlist at the API', () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\n360p/index.m3u8\n';
    expect(rewriteMasterPlaylist(master, (name) => `/api/${name}`)).toBe(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\n/api/360p\n',
    );
  });

  it('refuses a master playlist whose variants are not renditions', () => {
    expect(() => rewriteMasterPlaylist('#EXTM3U\n../other/index.m3u8\n', (n) => n)).toThrow();
  });

  it('replaces each segment with its address and keeps the tags', async () => {
    const playlist = '#EXTM3U\n#EXTINF:6.0,\nsegment_00000.ts\n#EXT-X-ENDLIST\n';
    expect(await rewriteRenditionPlaylist(playlist, async (file) => `https://s3/${file}`)).toBe(
      '#EXTM3U\n#EXTINF:6.0,\nhttps://s3/segment_00000.ts\n#EXT-X-ENDLIST\n',
    );
  });

  it('refuses a segment that points outside the rendition', async () => {
    for (const bad of ['../../other/segment.ts', 'sub/segment.ts']) {
      await expect(rewriteRenditionPlaylist(`#EXTM3U\n${bad}\n`, async (f) => f)).rejects.toThrow();
    }
  });
});

describe('renditions', () => {
  it('offers every step up to the source height and never upscales', () => {
    expect(chooseRenditions(2160).map((r) => r.name)).toEqual(['360p', '720p', '1080p']);
    expect(chooseRenditions(720).map((r) => r.name)).toEqual(['360p', '720p']);
    expect(chooseRenditions(480).map((r) => r.name)).toEqual(['360p']);
  });

  it('keeps one rendition at the source height when it is below the first step', () => {
    expect(chooseRenditions(240).map((r) => r.name)).toEqual(['240p']);
    expect(chooseRenditions(241).map((r) => r.name)).toEqual(['240p']);
  });

  it('gives a very small source a rendition name the playlists accept', () => {
    const [tiny] = chooseRenditions(64);
    expect(tiny?.name).toBe('64p');
    const master = buildMasterPlaylist({ width: 64, height: 64, durationSeconds: 1 }, [tiny!]);
    expect(rewriteMasterPlaylist(master, (name) => name)).toContain('\n64p\n');
  });

  it('lists the variants lowest first with an even width', () => {
    const renditions = chooseRenditions(1080);
    const master = buildMasterPlaylist(
      { width: 1920, height: 1080, durationSeconds: 10 },
      renditions,
    );
    expect(master).toContain('RESOLUTION=640x360\n360p/index.m3u8');
    expect(master).toContain('RESOLUTION=1280x720\n720p/index.m3u8');
    expect(master.indexOf('360p')).toBeLessThan(master.indexOf('1080p'));
  });
});
