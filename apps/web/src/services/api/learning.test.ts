import { describe, expect, it, vi } from 'vitest';
import { demoId } from '@/services/mock/seed/ids';
import { createServicesSignedInAs } from '@/test/mock-services';
import { isServiceError } from '../errors';
import { ApiClient } from './client';
import {
  createApiEnrollmentService,
  createApiNoteService,
  createApiProgressService,
  createApiStudioService,
} from './learning';

interface Recorded {
  method: string;
  path: string;
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
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(request);
    return Promise.resolve(respond(request));
  });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  return {
    requests,
    progress: createApiProgressService(client),
    enrollments: createApiEnrollmentService(client),
    notes: createApiNoteService(client),
    studio: createApiStudioService(client),
  };
}

const lessonId = demoId('les-js-1-4');
const apiError = (status: number, code: string) => json(status, { error: { code, message: code } });

describe('API progress service', () => {
  it('reads the course progress and marks lessons completed or not', async () => {
    const { services } = await createServicesSignedInAs('camila');
    const records = await services.progress.getCourseProgress(demoId('course-javascript'));
    const api = setup((request) =>
      request.method === 'GET'
        ? json(200, { progress: records })
        : json(200, { progress: records[0] }),
    );

    expect(await api.progress.getCourseProgress('c1')).toEqual(records);
    await api.progress.setLessonCompleted('l1', true);
    await api.progress.setLessonCompleted('l1', false);
    expect(api.requests).toMatchObject([
      { method: 'GET', path: '/courses/c1/progress' },
      { method: 'PUT', path: '/lessons/l1/progress', body: { completed: true } },
      { method: 'PUT', path: '/lessons/l1/progress', body: { completed: false } },
    ]);
  });

  it('saves the position in whole seconds and never below zero', async () => {
    const { services } = await createServicesSignedInAs('camila');
    const [record] = await services.progress.getCourseProgress(demoId('course-javascript'));
    const api = setup(() => json(200, { progress: record }));
    await api.progress.saveVideoPosition('l1', 12.6);
    await api.progress.saveVideoPosition('l1', -3);
    expect(api.requests.map((request) => request.body)).toEqual([
      { videoPositionSeconds: 13 },
      { videoPositionSeconds: 0 },
    ]);
  });

  it('submits quiz answers and lists the attempts', async () => {
    const { services } = await createServicesSignedInAs('camila');
    const submission = await services.progress.submitQuizAttempt(lessonId, {
      [demoId('q-js-1')]: demoId('q-js-1-b'),
    });
    const api = setup((request) =>
      request.method === 'POST'
        ? json(201, submission)
        : json(200, { attempts: [submission.attempt] }),
    );

    const result = await api.progress.submitQuizAttempt(lessonId, { q: 'o' });
    expect(result).toEqual(submission);
    expect(await api.progress.listQuizAttempts(lessonId)).toEqual([submission.attempt]);
    expect(api.requests).toMatchObject([
      { method: 'POST', path: `/quizzes/${lessonId}/attempts`, body: { answers: { q: 'o' } } },
      { method: 'GET', path: `/quizzes/${lessonId}/attempts` },
    ]);
  });

  it('encodes ids it puts in the path', async () => {
    const api = setup(() => json(200, { progress: [] }));
    await api.progress.getCourseProgress('a b/c');
    expect(api.requests[0]?.path).toBe('/courses/a%20b%2Fc/progress');
  });

  it('turns a locked lesson into a forbidden service error', async () => {
    const api = setup(() => apiError(403, 'forbidden'));
    await expect(api.progress.setLessonCompleted('l1', true)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });

  it('refuses a response that breaks the contract', async () => {
    const api = setup(() => json(200, { progress: { lessonId: 'x' } }));
    const error = await api.progress.setLessonCompleted('l1', true).catch((e: unknown) => e);
    expect(isServiceError(error) && error.code).toBe('unavailable');
  });
});

describe('API enrollment service', () => {
  it('lists my courses and where to continue', async () => {
    const { services } = await createServicesSignedInAs('camila');
    const mine = await services.enrollments.listMyCourses();
    const resume = await services.enrollments.getContinueLearning();
    const api = setup((request) =>
      request.path === '/me/courses' ? json(200, { courses: mine }) : json(200, { item: resume }),
    );

    expect(await api.enrollments.listMyCourses()).toEqual(mine);
    expect(await api.enrollments.getContinueLearning()).toEqual(resume);
    expect(api.requests.map((request) => request.path)).toEqual([
      '/me/courses',
      '/me/continue-learning',
    ]);
  });

  it('answers null when there is nothing to continue', async () => {
    const api = setup(() => json(200, { item: null }));
    expect(await api.enrollments.getContinueLearning()).toBeNull();
  });

  it('reads access from the tiny progress route: yes on 200, no on 403 or 404, error otherwise', async () => {
    const yes = setup(() => json(200, { progress: [] }));
    expect(await yes.enrollments.canAccess('c1')).toBe(true);
    expect(yes.requests[0]?.path).toBe('/courses/c1/progress');

    for (const [status, code] of [
      [403, 'forbidden'],
      [404, 'not_found'],
    ] as const) {
      const denied = setup(() => apiError(status, code));
      expect(await denied.enrollments.canAccess('c1')).toBe(false);
    }

    const down = setup(() => apiError(500, 'internal'));
    await expect(down.enrollments.canAccess('c1')).rejects.toMatchObject({ code: 'unavailable' });
  });

  it("lists a course's students", async () => {
    const { services } = await createServicesSignedInAs('rafael');
    const students = await services.enrollments.listCourseStudents(demoId('course-javascript'));
    const api = setup(() => json(200, { students }));
    expect(await api.enrollments.listCourseStudents('c1')).toEqual(students);
    expect(api.requests[0]).toMatchObject({ method: 'GET', path: '/courses/c1/students' });
  });
});

describe('API note service', () => {
  it('reads and saves the personal note, null included', async () => {
    const note = {
      userId: demoId('user-camila'),
      lessonId,
      content: 'remember',
      updatedAt: '2026-06-15T12:00:00.000Z',
    };
    const api = setup((request) =>
      request.method === 'GET' ? json(200, { note: null }) : json(200, { note }),
    );
    expect(await api.notes.getLessonNote(lessonId)).toBeNull();
    expect(await api.notes.saveLessonNote(lessonId, 'remember')).toEqual(note);
    // the text goes as typed: trimming is the server's business, and only for blank notes
    await api.notes.saveLessonNote(lessonId, '  indented\n');
    expect(api.requests).toMatchObject([
      { method: 'GET', path: `/lessons/${lessonId}/note` },
      { method: 'PUT', path: `/lessons/${lessonId}/note`, body: { content: 'remember' } },
      { method: 'PUT', body: { content: '  indented\n' } },
    ]);
  });
});

describe('API studio service', () => {
  it('reads the dashboard metrics', async () => {
    const { services } = await createServicesSignedInAs('rafael');
    const dashboard = await services.studio.getDashboard();
    const api = setup(() => json(200, dashboard));
    expect(await api.studio.getDashboard()).toEqual(dashboard);
    expect(api.requests[0]).toMatchObject({ method: 'GET', path: '/studio/metrics' });
  });
});
