import { describe, expect, it, vi } from 'vitest';
import { ApiClient } from './client';
import { createApiVideoService } from './video';

const assetId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';

function setup(body: unknown) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(
      `${init?.method ?? 'GET'} ${new URL(String(input)).pathname.replace('/api/v1', '')}`,
    );
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return Object.assign(createApiVideoService(client), { calls });
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

  it('lists the failed videos', async () => {
    const failed = {
      assetId,
      lessonId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a12',
      lessonTitle: 'Colour theory',
      courseId: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a13',
      courseTitle: 'Design basics',
      errorMessage: 'The file has no playable video stream',
      failedAt: '2026-10-13T10:00:00.000Z',
      sizeBytes: 1000,
    };
    const service = setup({ videos: [failed] });
    expect(await service.listFailed()).toEqual([failed]);
    expect(service.calls).toEqual(['GET /admin/videos/failed']);
  });

  it('sends a failed video back to the encoder', async () => {
    const video = {
      provider: 'local',
      assetId,
      status: 'processing',
      errorMessage: null,
      durationSeconds: null,
    };
    const service = setup({ video });
    expect(await service.retry(assetId)).toEqual(video);
    expect(service.calls).toEqual([`POST /admin/videos/${assetId}/retry`]);
  });
});
