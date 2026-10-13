import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { createApiVideoService } from './video';

const assetId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';

function setup(body: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return createApiVideoService(client);
}

describe('API video service', () => {
  it('gives the full playlist address together with the poster address', async () => {
    const service = setup({
      playbackUrl: `/api/v1/videos/${assetId}/master.m3u8?token=t`,
      posterUrl: 'http://storage.test/poster.jpg',
    });
    expect(await service.getPlayback(assetId)).toEqual({
      url: `http://api.test/api/v1/videos/${assetId}/master.m3u8?token=t`,
      posterUrl: 'http://storage.test/poster.jpg',
    });
  });

  it('has no poster for a video encoded without one', async () => {
    const service = setup({
      playbackUrl: `/api/v1/videos/${assetId}/master.m3u8?token=t`,
      posterUrl: null,
    });
    expect((await service.getPlayback(assetId)).posterUrl).toBeNull();
  });
});
