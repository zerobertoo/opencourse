import { describe, expect, it } from 'vitest';
import { resolveVideoUrl } from './registry';

const GUID = '0a1b2c3d-1111-2222-3333-444455556666';
const CLOUDFLARE_ID = '5d5bc37ffcf54c9b82e996823bffbb81';
const PANDA_PLAYER = 'player-vz-ab12cd34-ef5.tv.pandavideo.com.br';

describe('resolveVideoUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=4', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://vimeo.com/76979871', 'vimeo', '76979871'],
    ['https://vimeo.com/76979871/abcdef0123', 'vimeo', '76979871:abcdef0123'],
    ['https://player.vimeo.com/video/76979871?h=abcdef0123', 'vimeo', '76979871:abcdef0123'],
    ['https://vimeo.com/channels/staffpicks/76979871', 'vimeo', '76979871'],
    [`https://iframe.mediadelivery.net/embed/123456/${GUID}`, 'bunny', `123456/${GUID}`],
    [`https://iframe.mediadelivery.net/play/123456/${GUID}`, 'bunny', `123456/${GUID}`],
    [`https://iframe.videodelivery.net/${CLOUDFLARE_ID}`, 'cloudflare', CLOUDFLARE_ID],
    [
      `https://customer-abc123.cloudflarestream.com/${CLOUDFLARE_ID}/watch`,
      'cloudflare',
      CLOUDFLARE_ID,
    ],
    [`https://${PANDA_PLAYER}/embed/?v=${GUID}`, 'panda', `${PANDA_PLAYER}/${GUID}`],
    [
      `https://player-vz-ab12cd34-ef5.tv.pandavideo.com/embed/?v=${GUID}`,
      'panda',
      `player-vz-ab12cd34-ef5.tv.pandavideo.com/${GUID}`,
    ],
    ['https://vimeo.com/channels/staffpicks/76979871', 'vimeo', '76979871'],
    ['https://vimeo.com/groups/motion/videos/76979871', 'vimeo', '76979871'],
    ['https://vimeo.com/showcase/1234567/video/76979871', 'vimeo', '76979871'],
    ['https://vimeo.com/album/1234567/video/76979871', 'vimeo', '76979871'],
  ])('recognises %s', (link, plugin, externalId) => {
    expect(resolveVideoUrl(link)).toMatchObject({ plugin, externalId });
  });

  it('builds an https embed address that keeps what each provider needs', () => {
    expect(resolveVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.embedUrl).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
    );
    expect(resolveVideoUrl('https://vimeo.com/76979871/abcdef0123')?.embedUrl).toBe(
      'https://player.vimeo.com/video/76979871?h=abcdef0123',
    );
    for (const host of [PANDA_PLAYER, 'player-vz-ab12cd34-ef5.tv.pandavideo.com']) {
      const link = `https://${host}/embed/?v=${GUID}`;
      expect(resolveVideoUrl(link)?.embedUrl).toBe(link);
    }
  });

  it.each([
    'not a url',
    'http://youtu.be/dQw4w9WgXcQ',
    'https://youtu.be/short',
    'https://example.com/video.mp4',
    'https://evil.com/?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://vimeo.com/channels/staffpicks',
    // an album or showcase id must never be taken for the video id
    'https://vimeo.com/showcase/1234567',
    'https://vimeo.com/album/1234567/sort:date',
    `https://player-vz-x.tv.pandavideo.com.evil.com/embed/?v=${GUID}`,
    'javascript:alert(1)',
  ])('rejects %s', (link) => {
    expect(resolveVideoUrl(link)).toBeNull();
  });
});
