import { describe, expect, it, vi } from 'vitest';
import { createServicesSignedInAs } from '@/test/mock-services';
import { isServiceError } from '../errors';
import { ApiClient } from './client';
import { createApiCourseService } from './courses';
import { createApiCurriculumService } from './curriculum';
import { createApiGrantService } from './grants';

interface Recorded {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Services over a fake API that records every request and answers with `respond`. */
function setup(respond: (request: Recorded) => Response = () => json(200, {})) {
  const requests: Recorded[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const request: Recorded = {
      method: init?.method ?? 'GET',
      path: url.pathname.replace('/api/v1', ''),
      query: Object.fromEntries(url.searchParams),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    return Promise.resolve(respond(request));
  });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return {
    requests,
    courses: createApiCourseService(client),
    curriculum: createApiCurriculumService(client),
    grants: createApiGrantService(client),
  };
}

/** Valid payloads taken from the mock, so the contract checks run on realistic data. */
async function samples() {
  const { services } = await createServicesSignedInAs('rafael');
  const [listed] = await services.courses.list({ scope: 'managed' });
  const course = await services.courses.getById(listed!.id);
  const [grant] = await services.grants.list();
  return { listed: listed!, course, grant: grant!, services };
}

describe('API course service', () => {
  it('lists with the scope, status and search, and filters by instructor on this side', async () => {
    const { listed } = await samples();
    const other = {
      ...listed,
      id: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a99',
      instructorId: listed.id,
    };
    const api = setup(() => json(200, { courses: [listed, other] }));

    const all = await api.courses.list({ scope: 'managed', status: 'published', search: 'sql' });
    expect(api.requests[0]).toMatchObject({
      method: 'GET',
      path: '/courses',
      query: { scope: 'managed', status: 'published', search: 'sql' },
    });
    expect(all).toHaveLength(2);

    const own = await api.courses.list({ instructorId: listed.instructorId });
    expect(own.map((course) => course.id)).toEqual([listed.id]);
    // no scope in the query means the API default (catalog)
    expect(api.requests[1]?.query).toEqual({});
  });

  it('sends no search at all for an empty or blank one, which the API would refuse', async () => {
    const { listed } = await samples();
    const api = setup(() => json(200, { courses: [listed] }));
    await api.courses.list({ scope: 'managed', search: '' });
    await api.courses.list({ search: '   ' });
    await api.courses.list({ search: ' sql ' });
    expect(api.requests.map((request) => request.query.search)).toEqual([
      undefined,
      undefined,
      'sql',
    ]);
  });

  it('reads by id and by slug, and encodes the slug', async () => {
    const { course } = await samples();
    const api = setup(() => json(200, { course }));
    expect(await api.courses.getById(course.id)).toEqual(course);
    expect(await api.courses.getBySlug('a b/c')).toEqual(course);
    expect(api.requests.map((request) => request.path)).toEqual([
      `/courses/${course.id}`,
      '/courses/by-slug/a%20b%2Fc',
    ]);
  });

  it('creates with an empty description by default and updates with the given fields only', async () => {
    const { course } = await samples();
    const api = setup(() => json(200, { course }));
    await api.courses.create({ title: 'New', defaultLocale: 'en' });
    await api.courses.update(course.id, { status: 'published', sequentialOrder: true });
    expect(api.requests[0]).toMatchObject({
      method: 'POST',
      path: '/courses',
      body: { title: 'New', description: '', defaultLocale: 'en' },
    });
    expect(api.requests[1]).toMatchObject({
      method: 'PATCH',
      path: `/courses/${course.id}`,
      body: { status: 'published', sequentialOrder: true },
    });
  });

  it('turns API errors and broken responses into service errors', async () => {
    const forbidden = setup(() =>
      json(403, { error: { code: 'forbidden', message: 'Only the course instructor' } }),
    );
    await expect(forbidden.courses.getById('x')).rejects.toMatchObject({ code: 'forbidden' });

    const broken = setup(() => json(200, { course: { id: 'not a course' } }));
    const error = await broken.courses.getById('x').catch((caught: unknown) => caught);
    expect(isServiceError(error) && error.code).toBe('unavailable');

    const issues = setup(() =>
      json(400, { error: { code: 'validation', message: 'Not ready', details: { issues: [] } } }),
    );
    await expect(issues.courses.update('x', { status: 'published' })).rejects.toMatchObject({
      code: 'validation',
    });
  });
});

describe('API curriculum service', () => {
  it('creates, renames and deletes modules', async () => {
    const { course } = await samples();
    const moduleId = course.modules[0]!.id;
    const api = setup((request) =>
      json(
        request.method === 'POST' ? 201 : 200,
        request.method === 'POST' ? { course, moduleId } : { course },
      ),
    );

    expect(
      await api.curriculum.createModule({ courseId: course.id, title: 'M', locale: 'en' }),
    ).toEqual({
      course,
      moduleId,
    });
    await api.curriculum.updateModule(moduleId, { translations: [{ locale: 'en', title: 'R' }] });
    await api.curriculum.deleteModule(moduleId);
    expect(api.requests).toMatchObject([
      { method: 'POST', path: `/courses/${course.id}/modules`, body: { title: 'M', locale: 'en' } },
      {
        method: 'PATCH',
        path: `/modules/${moduleId}`,
        body: { translations: [{ locale: 'en', title: 'R' }] },
      },
      { method: 'DELETE', path: `/modules/${moduleId}` },
    ]);
  });

  it('creates, updates and deletes lessons', async () => {
    const { course } = await samples();
    const moduleId = course.modules[0]!.id;
    const lessonId = course.modules[0]!.lessons[0]!.id;
    const api = setup((request) =>
      json(
        request.method === 'POST' ? 201 : 200,
        request.method === 'POST' ? { course, lessonId } : { course },
      ),
    );

    expect(
      await api.curriculum.createLesson({ moduleId, type: 'text', title: 'L', locale: 'en' }),
    ).toEqual({ course, lessonId });
    await api.curriculum.updateLesson(lessonId, { durationSeconds: 90 });
    await api.curriculum.deleteLesson(lessonId);
    expect(api.requests).toMatchObject([
      {
        method: 'POST',
        path: `/modules/${moduleId}/lessons`,
        body: { type: 'text', title: 'L', locale: 'en' },
      },
      { method: 'PATCH', path: `/lessons/${lessonId}`, body: { durationSeconds: 90 } },
      { method: 'DELETE', path: `/lessons/${lessonId}` },
    ]);
  });

  it('links and removes external videos through the lesson update', async () => {
    const { course } = await samples();
    const api = setup(() => json(200, { course }));
    await api.curriculum.setLessonVideo('l1', { provider: 'external', url: 'https://v.example/a' });
    await api.curriculum.removeLessonVideo('l1');
    expect(api.requests).toMatchObject([
      { method: 'PATCH', path: '/lessons/l1', body: { video: { url: 'https://v.example/a' } } },
      { method: 'PATCH', path: '/lessons/l1', body: { video: null } },
    ]);
  });

  it('refuses attachments without calling the API: they wait for a later milestone', async () => {
    const api = setup();
    const attempts = [
      api.curriculum.addLessonAttachments('l1', [{ name: 'a.pdf', sizeBytes: 1, url: 'data:' }]),
      api.curriculum.removeLessonAttachment('l1', 'a1'),
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toMatchObject({ code: 'unavailable' });
    }
    expect(api.requests).toEqual([]);
  });

  describe('video upload', () => {
    const ASSET = '6f1c3a52-2d1c-4a43-9a43-0d3c8b6f9a11';
    const upload = {
      assetId: ASSET,
      partSizeBytes: 4,
      parts: [
        { partNumber: 1, url: 'https://s3.test/part-1' },
        { partNumber: 2, url: 'https://s3.test/part-2' },
      ],
    };
    const video = {
      provider: 'local',
      assetId: ASSET,
      status: 'processing',
      errorMessage: null,
      durationSeconds: null,
    };

    /** The curriculum service with a fake storage that answers every part with `answerPart`. */
    async function setupUpload(answerPart: () => Response) {
      const { course } = await samples();
      const requests: Recorded[] = [];
      const client = new ApiClient({
        baseUrl: 'http://api.test',
        fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
          const path = new URL(String(input)).pathname.replace('/api/v1', '');
          requests.push({
            method: init?.method ?? 'GET',
            path,
            query: {},
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          });
          return path.endsWith('/video/upload') ? json(200, upload) : json(200, { course, video });
        }) as typeof fetch,
      });
      const parts: Array<{ url: string; size: number }> = [];
      const sendPart = (async (url: RequestInfo | URL, init?: RequestInit) => {
        parts.push({ url: String(url), size: (init?.body as Blob).size });
        return answerPart();
      }) as typeof fetch;
      return { course, requests, parts, curriculum: createApiCurriculumService(client, sendPart) };
    }

    it('sends the file in slices, reports progress and completes with the ETags', async () => {
      const etags = ['"etag-1"', '"etag-2"'];
      const api = await setupUpload(
        () => new Response(null, { status: 200, headers: { etag: etags.shift()! } }),
      );
      const progress: number[] = [];
      const file = new File(['123456'], 'aula.mp4', { type: 'video/mp4' });

      const result = await api.curriculum.setLessonVideo(
        'l1',
        { provider: 'local', file },
        { onProgress: (fraction) => progress.push(fraction) },
      );

      expect(result).toEqual(api.course);
      expect(api.parts).toEqual([
        { url: 'https://s3.test/part-1', size: 4 },
        { url: 'https://s3.test/part-2', size: 2 },
      ]);
      expect(progress).toEqual([0.5, 1]);
      expect(api.requests).toMatchObject([
        {
          method: 'POST',
          path: '/lessons/l1/video/upload',
          body: { filename: 'aula.mp4', contentType: 'video/mp4', sizeBytes: 6 },
        },
        {
          method: 'POST',
          path: '/lessons/l1/video/complete',
          body: {
            parts: [
              { partNumber: 1, etag: '"etag-1"' },
              { partNumber: 2, etag: '"etag-2"' },
            ],
          },
        },
      ]);
    });

    it('stops without completing when the storage refuses a slice or hides its ETag', async () => {
      for (const answer of [
        () => new Response(null, { status: 403 }),
        () => new Response(null, { status: 200 }),
      ]) {
        const api = await setupUpload(answer);
        const file = new File(['123456'], 'aula.mp4', { type: 'video/mp4' });
        await expect(
          api.curriculum.setLessonVideo('l1', { provider: 'local', file }),
        ).rejects.toMatchObject({ code: 'unavailable' });
        expect(api.requests.map((request) => request.path)).toEqual(['/lessons/l1/video/upload']);
      }
    });
  });

  it('reorders with the layout as the body and surfaces a conflict', async () => {
    const { course } = await samples();
    const layout = course.modules.map((courseModule) => ({
      moduleId: courseModule.id,
      lessonIds: courseModule.lessons.map((lesson) => lesson.id),
    }));
    const ok = setup(() => json(200, { course }));
    expect(await ok.curriculum.reorder(course.id, layout)).toEqual(course);
    expect(ok.requests[0]).toMatchObject({
      method: 'PUT',
      path: `/courses/${course.id}/curriculum`,
      body: { modules: layout },
    });

    const stale = setup(() =>
      json(409, { error: { code: 'conflict', message: 'Layout changed' } }),
    );
    await expect(stale.curriculum.reorder(course.id, layout)).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});

describe('API grant service', () => {
  it('lists with filters and unwraps the grants', async () => {
    const { grant } = await samples();
    const api = setup(() => json(200, { grants: [grant] }));
    expect(await api.grants.list({ courseId: grant.courseId, status: 'active' })).toEqual([grant]);
    expect(api.requests[0]).toMatchObject({
      method: 'GET',
      path: '/grants',
      query: { courseId: grant.courseId, status: 'active' },
    });
  });

  it('creates (201 or 200), revokes and extends', async () => {
    const { grant } = await samples();
    const api = setup((request) =>
      json(request.path === '/grants' && request.method === 'POST' ? 201 : 200, { grant }),
    );
    const input = { userId: grant.userId, courseId: grant.courseId, expiresAt: null };
    expect(await api.grants.create(input)).toEqual(grant);
    expect(await api.grants.revoke(grant.id)).toEqual(grant);
    expect(await api.grants.extend(grant.id, '2030-01-01T00:00:00.000Z')).toEqual(grant);
    expect(api.requests).toMatchObject([
      { method: 'POST', path: '/grants', body: input },
      { method: 'POST', path: `/grants/${grant.id}/revoke` },
      {
        method: 'POST',
        path: `/grants/${grant.id}/extend`,
        body: { expiresAt: '2030-01-01T00:00:00.000Z' },
      },
    ]);

    const same = setup(() => json(200, { grant }));
    expect(await same.grants.create(input)).toEqual(grant);
  });

  it('surfaces a refused revoke as a service error', async () => {
    const api = setup(() =>
      json(404, { error: { code: 'not_found', message: 'Grant not found' } }),
    );
    await expect(api.grants.revoke('nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
