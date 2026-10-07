import { describe, expect, it, vi } from 'vitest';
import { isServiceError } from '../errors';
import { ApiClient } from './client';
import { createApiCertificateService } from './certificates';

const snapshot = {
  holderName: 'Sam Student',
  courseTitles: { en: 'Design basics' },
  defaultLocale: 'en',
  template: { signatoryName: 'Ines', signatoryRole: '', message: '' },
};
const issuedAt = '2026-10-06T10:00:00.000Z';
const userId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11';
const courseId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a12';
const certificateId = '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a13';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function setup(respond: () => Response) {
  const paths: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    paths.push(new URL(String(input)).pathname.replace('/api/v1', ''));
    return Promise.resolve(respond());
  });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return { service: createApiCertificateService(client), paths };
}

describe('API certificate service', () => {
  it('lists my certificates from the API', async () => {
    const certificate = {
      id: certificateId,
      userId,
      courseId,
      code: 'OC-ABCD-EFGH',
      issuedAt,
      ...snapshot,
    };
    const { service, paths } = setup(() => json(200, { certificates: [certificate] }));
    expect(await service.listMine()).toEqual([certificate]);
    expect(paths).toEqual(['/me/certificates']);
  });

  it('verifies a trimmed, encoded code', async () => {
    const { service, paths } = setup(() =>
      json(200, { code: 'OC-ABCD-EFGH', issuedAt, ...snapshot }),
    );
    expect((await service.verify(' OC-ABCD-EFGH '))?.holderName).toBe('Sam Student');
    expect(paths).toEqual(['/certificates/verify/OC-ABCD-EFGH']);
  });

  it('turns a 404 into null but lets other failures through', async () => {
    const missing = setup(() => json(404, { error: { code: 'not_found', message: 'nope' } }));
    expect(await missing.service.verify('OC-ABCD-EFGH')).toBeNull();

    const broken = setup(() => json(500, { error: { code: 'internal', message: 'boom' } }));
    const error = await broken.service.verify('OC-ABCD-EFGH').catch((caught: unknown) => caught);
    expect(isServiceError(error)).toBe(true);
  });
});
