import { describe, expect, it, vi } from 'vitest';
import { isServiceError } from '../errors';
import { ApiClient } from './client';
import { createApiCourseService } from './courses';

const COURSE_ID = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';
const COVER_ID = '5c1b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a22';

const course = {
  id: COURSE_ID,
  slug: 'course',
  status: 'draft',
  coverImageUrl: `/api/v1/courses/${COURSE_ID}/cover/${COVER_ID}`,
  instructorId: '9d4e1c27-5b8a-4f10-a3c6-7e2f9b0d1a55',
  defaultLocale: 'en',
  sequentialOrder: false,
  certificateTemplate: { enabled: true, signatoryName: '', signatoryRole: '', message: '' },
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  translations: [],
  modules: [],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(sendFile: typeof fetch) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace('/api/v1', '');
    calls.push(`${init?.method ?? 'GET'} ${path}`);
    if (path.endsWith('/complete')) return Promise.resolve(json(200, { course }));
    if (init?.method === 'DELETE') {
      return Promise.resolve(json(200, { course: { ...course, coverImageUrl: null } }));
    }
    return Promise.resolve(json(200, { coverId: COVER_ID, uploadUrl: 'http://storage.test/put' }));
  });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return { service: createApiCourseService(client, sendFile), calls };
}

describe('course cover service', () => {
  const file = new File(['image'], 'cover.png', { type: 'image/png' });

  it('asks for an address, sends the image to the storage, then confirms it', async () => {
    const sendFile = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    const { service, calls } = setup(sendFile as unknown as typeof fetch);

    const updated = await service.uploadCover(COURSE_ID, file);

    expect(updated.coverImageUrl).toContain(COVER_ID);
    expect(sendFile).toHaveBeenCalledWith(
      'http://storage.test/put',
      expect.objectContaining({ method: 'PUT', body: file }),
    );
    expect(calls).toEqual([
      `POST /courses/${COURSE_ID}/cover`,
      `POST /courses/${COURSE_ID}/cover/complete`,
    ]);
  });

  it('does not confirm an upload the storage refused', async () => {
    const sendFile = vi.fn(() => Promise.resolve(new Response(null, { status: 403 })));
    const { service, calls } = setup(sendFile as unknown as typeof fetch);

    const error = await service.uploadCover(COURSE_ID, file).catch((caught: unknown) => caught);

    expect(isServiceError(error) && error.code).toBe('unavailable');
    expect(calls).toEqual([`POST /courses/${COURSE_ID}/cover`]);
  });

  it('removes the cover', async () => {
    const { service } = setup(vi.fn() as unknown as typeof fetch);
    expect((await service.removeCover(COURSE_ID)).coverImageUrl).toBeNull();
  });
});
