import { describe, expect, it, vi } from 'vitest';
import { createServicesSignedInAs } from '@/test/mock-services';
import { demoId } from './mock/seed/ids';
import { ApiClient } from './api/client';
import { createHybridServices } from './hybrid';
import { createMockServices } from './mock';

const student = {
  id: '3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a21',
  name: 'Sam',
  email: 'sam@example.com',
  avatarUrl: null,
  role: 'student',
  locale: 'en',
  timeZone: 'UTC',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
};

type Routes = Record<string, () => Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Hybrid services over a fake API answering by "METHOD /path", with an API-mode mock. */
function setup(routes: Routes) {
  const calls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace('/api/v1', '')}`;
    calls.push(key);
    const route = routes[key];
    return Promise.resolve(
      route ? route() : json(404, { error: { code: 'not_found', message: key } }),
    );
  });
  const mock = createMockServices({ storage: null, mode: 'api', latency: { min: 0, max: 0 } });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  const services = createHybridServices(client, mock, () => ({ locale: 'en', timeZone: 'UTC' }));
  return { services, mock, calls };
}

describe('hybrid learning services', () => {
  it('reads enrollments, progress, notes and the dashboard from the API, not from the mock', async () => {
    const { services: demo } = await createServicesSignedInAs('camila');
    const mine = await demo.enrollments.listMyCourses();
    const { services, mock, calls } = setup({
      'POST /auth/login': () => json(200, { user: student }),
      'GET /me/courses': () => json(200, { courses: mine }),
      'GET /me/continue-learning': () => json(200, { item: null }),
      [`GET /lessons/${demoId('les-js-1-1')}/note`]: () => json(200, { note: null }),
    });
    await services.auth.signIn(student.email, 'secret-password');

    // the mock knows no courses or grants in API mode: whatever comes back is the API's answer
    expect(mock.mock.store.db.courses).toEqual([]);
    expect(await services.enrollments.listMyCourses()).toEqual(mine);
    expect(await services.enrollments.getContinueLearning()).toBeNull();
    expect(await services.notes.getLessonNote(demoId('les-js-1-1'))).toBeNull();
    expect(calls).toEqual([
      'POST /auth/login',
      'GET /me/courses',
      'GET /me/continue-learning',
      `GET /lessons/${demoId('les-js-1-1')}/note`,
    ]);
  });

  it('grades quizzes on the server instead of refusing them', async () => {
    const { services: demo } = await createServicesSignedInAs('camila');
    const submission = await demo.progress.submitQuizAttempt(demoId('les-js-1-4'), {
      [demoId('q-js-1')]: demoId('q-js-1-b'),
    });
    const { services, calls } = setup({
      'POST /auth/login': () => json(200, { user: student }),
      [`POST /quizzes/${demoId('les-js-1-4')}/attempts`]: () => json(201, submission),
    });
    await services.auth.signIn(student.email, 'secret-password');

    const result = await services.progress.submitQuizAttempt(demoId('les-js-1-4'), {});
    expect(result.feedback.passed).toBe(submission.feedback.passed);
    expect(calls.at(-1)).toBe(`POST /quizzes/${demoId('les-js-1-4')}/attempts`);
  });

  it('shows the API answer when the student may not open the course', async () => {
    const { services } = setup({
      'POST /auth/login': () => json(200, { user: student }),
      'GET /courses/c1/progress': () => json(403, { error: { code: 'forbidden', message: 'no' } }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    expect(await services.enrollments.canAccess('c1')).toBe(false);
  });

  it('reads the dashboard from the API', async () => {
    const dashboard = { activeStudents: 2, publishedCourses: 1, completionRate: 0.5, courses: [] };
    const { services } = setup({
      'POST /auth/login': () => json(200, { user: { ...student, role: 'instructor' } }),
      'GET /studio/metrics': () => json(200, dashboard),
    });
    await services.auth.signIn(student.email, 'secret-password');
    expect(await services.studio.getDashboard()).toEqual(dashboard);
  });
});
