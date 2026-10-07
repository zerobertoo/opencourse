import type { CourseDetail, Grant, ListedCourse, User } from '@opencourse/shared';
import { describe, expect, it, vi } from 'vitest';
import { createServicesSignedInAs } from '@/test/mock-services';
import { ApiClient } from './api/client';
import { createHybridServices } from './hybrid';
import { createMockServices } from './mock';

type Routes = Record<string, () => Response>;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const user = (id: string, role: User['role'], name: string): User => ({
  id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  avatarUrl: null,
  role,
  locale: 'en',
  timeZone: 'UTC',
  active: true,
  createdAt: '2026-10-01T10:00:00.000Z',
});

const student = user('3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a21', 'student', 'Sam');
const otherStudent = user('3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a22', 'student', 'Olga');
const instructor = user('3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a23', 'instructor', 'Ines');

/** A real course payload (valid UUIDs and shape) borrowed from the demo mock. */
async function sampleCourse(instructorId: string) {
  const { services } = await createServicesSignedInAs('rafael');
  const [listed] = await services.courses.list({ scope: 'managed' });
  const base = await services.courses.getById(listed!.id);
  const detail: CourseDetail = { ...base, status: 'published', instructorId };
  const { modules, ...summary } = detail;
  const listing = (myGrant: Grant | null): ListedCourse => ({
    ...summary,
    moduleCount: modules.length,
    lessonCount: modules.flatMap((courseModule) => courseModule.lessons).length,
    durationSeconds: 600,
    completeLocales: ['pt-BR', 'en'],
    myGrant,
  });
  const grantFor = (userId: string, status: Grant['status'] = 'active'): Grant => ({
    id: `3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0b${userId.slice(-2)}`,
    userId,
    courseId: detail.id,
    source: 'manual',
    createdById: instructorId,
    createdAt: '2026-10-02T10:00:00.000Z',
    // an expired grant carries the past date the API computed it from
    expiresAt: status === 'expired' ? '2020-01-01T00:00:00.000Z' : null,
    status,
  });
  return { detail, listing, grantFor };
}

/** Hybrid services over a fake API, with an API-mode mock (empty, mirrored). */
function setup(routes: Routes) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const key = `${init?.method ?? 'GET'} ${url.pathname.replace('/api/v1', '')}`;
    const route = routes[key];
    return Promise.resolve(
      route ? route() : json(404, { error: { code: 'not_found', message: key } }),
    );
  });
  const mock = createMockServices({ storage: null, mode: 'api', latency: { min: 0, max: 0 } });
  const client = new ApiClient({ baseUrl: 'http://api.test', fetch: fetchMock as typeof fetch });
  const services = createHybridServices(client, mock, () => ({ locale: 'en', timeZone: 'UTC' }));
  return { services, mock, routes };
}

const login = (account: User) => ({ 'POST /auth/login': () => json(200, { user: account }) });

describe('hybrid mirror of courses and grants', () => {
  it('mirrors a course read in full, and keeps its curriculum when a list shows it again', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(student),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id))] }),
    });
    await services.auth.signIn(student.email, 'secret-password');

    await services.courses.getById(detail.id);
    expect(mock.mock.store.db.courses[0]?.modules.length).toBe(detail.modules.length);

    await services.courses.list();
    expect(mock.mock.store.db.courses).toHaveLength(1);
    expect(mock.mock.store.db.courses[0]?.modules.length).toBe(detail.modules.length);
  });

  it('mirrors the catalog as summaries without a curriculum for courses never opened', async () => {
    const { detail, listing } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(null)] }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await services.courses.list();
    expect(mock.mock.store.db.courses.map((course) => course.id)).toEqual([detail.id]);
    expect(mock.mock.store.db.courses[0]?.modules).toEqual([]);
  });

  it('turns the own grant of the catalog into mirrored access, and drops it when it disappears', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    let current: Grant | null = grantFor(student.id);
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(current)] }),
    });
    await services.auth.signIn(student.email, 'secret-password');

    await services.courses.list();
    expect(mock.mock.store.db.grants.map((grant) => grant.userId)).toEqual([student.id]);
    await expect(mock.enrollments.canAccess(detail.id)).resolves.toBe(true);

    current = null;
    await services.courses.list();
    expect(mock.mock.store.db.grants).toEqual([]);
    await expect(mock.enrollments.canAccess(detail.id)).resolves.toBe(false);
  });

  it('mirrors an expired own grant as expired, so the mock denies access', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id, 'expired'))] }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await services.courses.list();
    expect(mock.mock.store.db.grants[0]?.status).toBe('expired');
    await expect(mock.enrollments.canAccess(detail.id)).resolves.toBe(false);
  });

  it('mirrors the grants a manager lists together with their users', async () => {
    const { detail, grantFor } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(instructor),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
      'GET /grants': () => json(200, { grants: [grantFor(student.id)] }),
      [`GET /users/${student.id}`]: () => json(200, { user: student }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    await services.courses.getById(detail.id);

    const listed = await services.grants.list({ courseId: detail.id });
    expect(listed).toHaveLength(1);
    expect(mock.mock.store.db.users.map((account) => account.id)).toContain(student.id);

    const students = await mock.enrollments.listCourseStudents(detail.id);
    expect(students.map((entry) => entry.user.name)).toEqual(['Sam']);
  });

  it('still lists grants when a user cannot be read, mirroring only the ones it can', async () => {
    const { detail, grantFor } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(instructor),
      'GET /grants': () => json(200, { grants: [grantFor(student.id), grantFor(otherStudent.id)] }),
      [`GET /users/${student.id}`]: () => json(200, { user: student }),
      // the second user answers 404
    });
    await services.auth.signIn(instructor.email, 'secret-password');

    expect(await services.grants.list({ courseId: detail.id })).toHaveLength(2);
    expect(mock.mock.store.db.grants.map((grant) => grant.userId)).toEqual([student.id]);
  });

  it('mirrors a created, revoked and extended grant', async () => {
    const { detail, grantFor } = await sampleCourse(instructor.id);
    const granted = grantFor(student.id);
    const { services, mock } = setup({
      ...login(instructor),
      'POST /grants': () => json(201, { grant: granted }),
      [`POST /grants/${granted.id}/extend`]: () =>
        json(200, { grant: { ...granted, expiresAt: '2099-01-01T00:00:00.000Z' } }),
      [`POST /grants/${granted.id}/revoke`]: () =>
        json(200, { grant: { ...granted, status: 'revoked' } }),
      [`GET /users/${student.id}`]: () => json(200, { user: student }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    const status = () => mock.mock.store.db.grants.map((grant) => grant.status);

    await services.grants.create({ userId: student.id, courseId: detail.id, expiresAt: null });
    expect(status()).toEqual(['active']);
    await services.grants.extend(granted.id, '2099-01-01T00:00:00.000Z');
    expect(mock.mock.store.db.grants[0]?.expiresAt).toBe('2099-01-01T00:00:00.000Z');
    await services.grants.revoke(granted.id);
    expect(status()).toEqual(['revoked']);
    expect(mock.mock.store.db.grants).toHaveLength(1);
  });

  it('mirrors the course returned by a curriculum write', async () => {
    const { detail } = await sampleCourse(instructor.id);
    const lesson = detail.modules[0]!.lessons[0]!;
    const changed: CourseDetail = {
      ...detail,
      modules: detail.modules.map((courseModule, index) =>
        index === 0
          ? {
              ...courseModule,
              lessons: courseModule.lessons.map((item) =>
                item.id === lesson.id ? { ...item, durationSeconds: 4242 } : item,
              ),
            }
          : courseModule,
      ),
    };
    const { services, mock } = setup({
      ...login(instructor),
      [`PATCH /lessons/${lesson.id}`]: () => json(200, { course: changed }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');

    await services.curriculum.updateLesson(lesson.id, { durationSeconds: 4242 });
    expect(mock.mock.store.db.courses[0]?.modules[0]?.lessons[0]?.durationSeconds).toBe(4242);
  });

  it('fills the student home from the catalog: granted courses come with their curriculum', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id))] }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
    });
    await services.auth.signIn(student.email, 'secret-password');

    // no screen listed the catalog yet: the enrollments service has to look it up itself
    const mine = await services.enrollments.listMyCourses();
    expect(mine.map((entry) => entry.course.id)).toEqual([detail.id]);
    expect(mine[0]?.progress.totalCount).toBeGreaterThan(0);
  });

  it('does not list courses whose grant is expired or revoked as enrolled', async () => {
    const { listing, grantFor } = await sampleCourse(instructor.id);
    const { services } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id, 'expired'))] }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    expect(await services.enrollments.listMyCourses()).toEqual([]);
  });

  it('checks access against the catalog, so a course opened by its address is not refused', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id))] }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await expect(services.enrollments.canAccess(detail.id)).resolves.toBe(true);
    await expect(services.enrollments.getContinueLearning()).resolves.toBeNull();
  });

  it('lists the students of a course from the real grants', async () => {
    const { detail, grantFor } = await sampleCourse(instructor.id);
    const { services } = setup({
      ...login(instructor),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
      'GET /grants': () => json(200, { grants: [grantFor(student.id)] }),
      [`GET /users/${student.id}`]: () => json(200, { user: student }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    const students = await services.enrollments.listCourseStudents(detail.id);
    expect(students.map((entry) => entry.user.name)).toEqual(['Sam']);
  });

  it('counts the real students and published courses on the Studio dashboard', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services } = setup({
      ...login(instructor),
      'GET /courses': () => json(200, { courses: [listing(null)] }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
      'GET /grants': () => json(200, { grants: [grantFor(student.id)] }),
      [`GET /users/${student.id}`]: () => json(200, { user: student }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    const dashboard = await services.studio.getDashboard();
    expect(dashboard.publishedCourses).toBe(1);
    expect(dashboard.activeStudents).toBe(1);
  });

  it('drops a course from the student list once the catalog no longer holds it or its grant', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    let catalog: ListedCourse[] = [listing(grantFor(student.id))];
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: catalog }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    expect(await services.enrollments.listMyCourses()).toHaveLength(1);

    // archived and revoked meanwhile: the catalog does not list it any more
    catalog = [];
    expect(await services.enrollments.listMyCourses()).toEqual([]);
    await expect(services.enrollments.canAccess(detail.id)).resolves.toBe(false);
    expect(mock.mock.store.db.grants).toEqual([]);
    expect(mock.mock.store.db.courses).toEqual([]);
  });

  it('keeps the courses an instructor manages when the catalog does not list them', async () => {
    const { detail, listing } = await sampleCourse(instructor.id);
    const draft = { ...listing(null), status: 'draft' as const };
    const { services, mock } = setup({
      ...login(instructor),
      'GET /courses': () => json(200, { courses: [] }),
      'GET /courses?scope=managed': () => json(200, { courses: [draft] }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: { ...detail, status: 'draft' } }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    await services.courses.getById(detail.id);
    await services.enrollments.listMyCourses();
    expect(mock.mock.store.db.courses.map((course) => course.id)).toEqual([detail.id]);
  });

  it('refuses to grade a quiz whose answers the API keeps from students', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const redacted: CourseDetail = {
      ...detail,
      modules: detail.modules.map((courseModule) => ({
        ...courseModule,
        lessons: courseModule.lessons.map((lesson) =>
          lesson.type === 'quiz'
            ? {
                ...lesson,
                quiz: {
                  ...lesson.quiz,
                  questions: lesson.quiz.questions.map((question) => ({
                    ...question,
                    options: question.options.map(({ isCorrect, ...option }) => {
                      void isCorrect;
                      return option;
                    }),
                  })),
                },
              }
            : lesson,
        ),
      })),
    };
    const quiz = redacted.modules
      .flatMap((courseModule) => courseModule.lessons)
      .find((lesson) => lesson.type === 'quiz')!;
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id))] }),
      [`GET /courses/${detail.id}`]: () => json(200, { course: redacted }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await services.courses.getById(detail.id);

    // grading arrives with the quiz milestone: a score of zero for every answer would be a lie
    await expect(services.progress.submitQuizAttempt(quiz.id, {})).rejects.toMatchObject({
      code: 'unavailable',
    });
    expect(mock.mock.store.db.quizAttempts).toEqual([]);
  });

  it('still grades quizzes for people who see the answers', async () => {
    const { detail } = await sampleCourse(instructor.id);
    const quiz = detail.modules
      .flatMap((courseModule) => courseModule.lessons)
      .find((lesson) => lesson.type === 'quiz')!;
    const { services } = setup({
      ...login(instructor),
      [`GET /courses/${detail.id}`]: () => json(200, { course: detail }),
    });
    await services.auth.signIn(instructor.email, 'secret-password');
    await services.courses.getById(detail.id);
    const result = await services.progress.submitQuizAttempt(quiz.id, {});
    expect(result.score.passed).toBe(false);
    expect(result.attempt.lessonId).toBe(quiz.id);
  });

  it('forgets mirrored courses and grants when the account changes or signs out', async () => {
    const { detail, listing, grantFor } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      'POST /auth/login': () => json(200, { user: student }),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
      'GET /courses': () => json(200, { courses: [listing(grantFor(student.id))] }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await services.courses.list();
    expect(mock.mock.store.db.courses).toHaveLength(1);
    expect(mock.mock.store.db.grants).toHaveLength(1);

    await services.auth.signOut();
    expect(mock.mock.store.db.courses).toEqual([]);
    expect(mock.mock.store.db.grants).toEqual([]);
    expect(detail.id).toBeDefined();
  });

  it('keeps the mirrored courses when the same account signs in again', async () => {
    const { listing } = await sampleCourse(instructor.id);
    const { services, mock } = setup({
      ...login(student),
      'GET /courses': () => json(200, { courses: [listing(null)] }),
    });
    await services.auth.signIn(student.email, 'secret-password');
    await services.courses.list();
    await services.auth.signIn(student.email, 'secret-password');
    expect(mock.mock.store.db.courses).toHaveLength(1);
  });
});
