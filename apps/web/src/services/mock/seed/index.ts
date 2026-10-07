import type { Certificate, Grant, Progress, QuizAttempt, User } from '@opencourse/shared';
import type { MockDatabase, StoredInvite } from '../store';
import { buildDesignCourse } from './course-design';
import { buildJavascriptCourse } from './course-javascript';
import { buildPhotographyCourse, buildSqlCourse, buildTimeManagementCourse } from './course-others';
import { convertIdsToUuids, demoId } from './ids';

/** Demo users used by the "sign in as student, instructor or admin" buttons. */
export const DEMO_USER_IDS = {
  student: demoId('user-lucas'),
  instructor: demoId('user-rafael'),
  admin: demoId('user-marina'),
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function createDateHelpers(now: Date) {
  const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY_MS).toISOString();
  return { daysFromNow };
}

function buildUsers(daysFromNow: (days: number) => string): User[] {
  const make = (
    id: string,
    name: string,
    role: User['role'],
    createdDaysAgo: number,
    extra: Partial<User> = {},
  ): User => ({
    id,
    name,
    email: `${id.replace('user-', '')}@opencourse.example`,
    avatarUrl: null,
    role,
    locale: 'pt-BR',
    timeZone: 'America/Sao_Paulo',
    active: true,
    createdAt: daysFromNow(-createdDaysAgo),
    ...extra,
  });

  return [
    make('user-marina', 'Marina Albuquerque', 'admin', 400),
    make('user-rafael', 'Rafael Teixeira', 'instructor', 380),
    make('user-beatriz', 'Beatriz Nogueira', 'instructor', 350),
    make('user-lucas', 'Lucas Ferreira', 'student', 120),
    make('user-camila', 'Camila Duarte', 'student', 110),
    make('user-thiago', 'Thiago Moreira', 'student', 100),
    make('user-juliana', 'Juliana Prado', 'student', 95),
    make('user-felipe', 'Felipe Azevedo', 'student', 80),
    make('user-renata', 'Renata Cardoso', 'student', 75),
    make('user-gustavo', 'Gustavo Lima', 'student', 60),
    make('user-patricia', 'Patrícia Sales', 'student', 45),
    make('user-diego', 'Diego Rocha', 'student', 40, { active: false }),
    make('user-larissa', 'Larissa Campos', 'student', 30),
    make('user-daniel', 'Daniel Whitaker', 'student', 20, {
      locale: 'en',
      timeZone: 'America/New_York',
    }),
  ];
}

const INSTRUCTOR_BY_COURSE: Record<string, string> = {
  'course-javascript': 'user-rafael',
  'course-design': 'user-beatriz',
  'course-sql': 'user-rafael',
};

function buildGrants(daysFromNow: (days: number) => string): Grant[] {
  let counter = 0;
  const grant = (
    userId: string,
    courseId: string,
    options: {
      source?: Grant['source'];
      expiresInDays?: number | null;
      status?: Grant['status'];
      createdDaysAgo?: number;
    } = {},
  ): Grant => {
    counter += 1;
    return {
      id: `grant-${counter}`,
      userId,
      courseId,
      source: options.source ?? 'manual',
      createdById: INSTRUCTOR_BY_COURSE[courseId] ?? 'user-marina',
      createdAt: daysFromNow(-(options.createdDaysAgo ?? 30)),
      expiresAt:
        options.expiresInDays === undefined || options.expiresInDays === null
          ? null
          : daysFromNow(options.expiresInDays),
      status: options.status ?? 'active',
    };
  };

  return [
    grant('user-lucas', 'course-javascript', { createdDaysAgo: 60 }),
    grant('user-lucas', 'course-design', { expiresInDays: 60, createdDaysAgo: 30 }),
    grant('user-lucas', 'course-sql', { source: 'invite', createdDaysAgo: 90 }),
    grant('user-camila', 'course-javascript', { expiresInDays: 90, createdDaysAgo: 40 }),
    grant('user-camila', 'course-sql', { createdDaysAgo: 35 }),
    grant('user-thiago', 'course-javascript', { createdDaysAgo: 70 }),
    grant('user-thiago', 'course-design', { createdDaysAgo: 50 }),
    grant('user-juliana', 'course-javascript', { expiresInDays: -10, createdDaysAgo: 80 }),
    grant('user-juliana', 'course-sql', { status: 'revoked', createdDaysAgo: 60 }),
    grant('user-felipe', 'course-design', { createdDaysAgo: 45 }),
    grant('user-renata', 'course-javascript', { createdDaysAgo: 55 }),
    grant('user-renata', 'course-sql', { expiresInDays: 30, createdDaysAgo: 20 }),
    grant('user-gustavo', 'course-sql', { createdDaysAgo: 25 }),
    grant('user-patricia', 'course-design', { expiresInDays: 15, createdDaysAgo: 15 }),
    grant('user-patricia', 'course-javascript', { source: 'invite', createdDaysAgo: 14 }),
    grant('user-larissa', 'course-javascript', { createdDaysAgo: 18 }),
    grant('user-daniel', 'course-javascript', { createdDaysAgo: 12 }),
    grant('user-diego', 'course-sql', { createdDaysAgo: 38 }),
  ];
}

function buildInvites(daysFromNow: (days: number) => string): StoredInvite[] {
  return [
    {
      id: 'invite-1',
      email: 'novo.aluno@opencourse.example',
      courseId: 'course-sql',
      token: 'demo-convite-sql',
      createdById: 'user-rafael',
      createdAt: daysFromNow(-2),
      expiresAt: daysFromNow(12),
      status: 'pending',
    },
    {
      id: 'invite-2',
      email: 'convidado.geral@opencourse.example',
      courseId: null,
      token: 'demo-convite-geral',
      createdById: 'user-marina',
      createdAt: daysFromNow(-5),
      expiresAt: daysFromNow(9),
      status: 'pending',
    },
    {
      id: 'invite-3',
      email: 'convite.vencido@opencourse.example',
      courseId: 'course-javascript',
      token: 'demo-convite-vencido',
      createdById: 'user-rafael',
      createdAt: daysFromNow(-30),
      expiresAt: daysFromNow(-16),
      status: 'pending',
    },
  ];
}

interface CompletionSpec {
  userId: string;
  lessonIds: string[];
  /** How many days ago the last activity on this group of lessons happened. */
  daysAgo: number;
}

const JS_MODULE_1 = ['les-js-1-1', 'les-js-1-2', 'les-js-1-3', 'les-js-1-4'];
const JS_MODULE_2 = ['les-js-2-1', 'les-js-2-2', 'les-js-2-3'];
const SQL_ALL = [
  'les-sql-1-1',
  'les-sql-1-2',
  'les-sql-1-3',
  'les-sql-2-1',
  'les-sql-2-2',
  'les-sql-2-3',
];

function buildProgress(daysFromNow: (days: number) => string): Progress[] {
  const completions: CompletionSpec[] = [
    { userId: 'user-lucas', lessonIds: SQL_ALL, daysAgo: 20 },
    { userId: 'user-lucas', lessonIds: ['les-design-1-1', 'les-design-1-2'], daysAgo: 3 },
    { userId: 'user-lucas', lessonIds: JS_MODULE_1, daysAgo: 1 },
    { userId: 'user-camila', lessonIds: JS_MODULE_1.slice(0, 3), daysAgo: 4 },
    { userId: 'user-camila', lessonIds: ['les-sql-1-1'], daysAgo: 9 },
    {
      userId: 'user-thiago',
      lessonIds: [...JS_MODULE_1, ...JS_MODULE_2, 'les-js-3-1', 'les-js-3-2'],
      daysAgo: 2,
    },
    { userId: 'user-thiago', lessonIds: ['les-design-1-1'], daysAgo: 12 },
    { userId: 'user-juliana', lessonIds: JS_MODULE_1.slice(0, 2), daysAgo: 25 },
    {
      userId: 'user-felipe',
      lessonIds: ['les-design-1-1', 'les-design-1-2', 'les-design-1-3', 'les-design-1-4'],
      daysAgo: 6,
    },
    { userId: 'user-renata', lessonIds: ['les-js-1-1'], daysAgo: 30 },
    { userId: 'user-renata', lessonIds: SQL_ALL.slice(0, 4), daysAgo: 7 },
    { userId: 'user-patricia', lessonIds: ['les-js-1-1'], daysAgo: 8 },
    { userId: 'user-larissa', lessonIds: [...JS_MODULE_1, ...JS_MODULE_2.slice(0, 2)], daysAgo: 5 },
    { userId: 'user-daniel', lessonIds: ['les-js-1-1', 'les-js-1-2'], daysAgo: 10 },
  ];

  const progress: Progress[] = completions.flatMap(({ userId, lessonIds, daysAgo }) =>
    lessonIds.map((lessonId) => ({
      userId,
      lessonId,
      completed: true,
      videoPositionSeconds: 0,
      updatedAt: daysFromNow(-daysAgo),
    })),
  );

  // in-progress lesson of the demo student: video stopped at 5min12s
  progress.push({
    userId: 'user-lucas',
    lessonId: 'les-js-2-1',
    completed: false,
    videoPositionSeconds: 312,
    updatedAt: daysFromNow(-0.5),
  });
  return progress;
}

function buildQuizAttempts(daysFromNow: (days: number) => string): QuizAttempt[] {
  return [
    {
      id: 'attempt-1',
      userId: 'user-lucas',
      lessonId: 'les-js-1-4',
      answers: { 'q-js-1': 'q-js-1-a', 'q-js-2': 'q-js-2-a', 'q-js-3': 'q-js-3-a' },
      score: 33,
      passed: false,
      createdAt: daysFromNow(-2),
    },
    {
      id: 'attempt-2',
      userId: 'user-lucas',
      lessonId: 'les-js-1-4',
      answers: { 'q-js-1': 'q-js-1-a', 'q-js-2': 'q-js-2-b', 'q-js-3': 'q-js-3-b' },
      score: 100,
      passed: true,
      createdAt: daysFromNow(-1),
    },
    {
      id: 'attempt-3',
      userId: 'user-lucas',
      lessonId: 'les-sql-1-3',
      answers: { 'q-sql-1': 'q-sql-1-a', 'q-sql-2': 'q-sql-2-b' },
      score: 100,
      passed: true,
      createdAt: daysFromNow(-24),
    },
  ];
}

function buildCertificates(daysFromNow: (days: number) => string): Certificate[] {
  return [
    {
      id: 'cert-1',
      userId: 'user-lucas',
      courseId: 'course-sql',
      code: 'OC-7K2M-9QXA',
      issuedAt: daysFromNow(-20),
    },
  ];
}

function buildSettings(): MockDatabase['settings'] {
  return {
    brand: { name: 'OpenCourse', logoUrl: null, primaryColor: '#2f6f5e' },
    enabledLocales: ['pt-BR', 'en'],
    defaultLocale: 'pt-BR',
    videoAdapter: 'local',
    email: {
      host: 'localhost',
      port: 1025,
      username: '',
      fromAddress: 'nao-responda@opencourse.example',
      secure: false,
    },
  };
}

/**
 * Starting point when the real API owns the data: nothing but the default settings. Users,
 * courses and grants arrive from the API and are mirrored in as they are read.
 */
export function createEmptyDatabase(): MockDatabase {
  return {
    users: [],
    courses: [],
    grants: [],
    invites: [],
    progress: [],
    quizAttempts: [],
    notes: [],
    certificates: [],
    settings: buildSettings(),
    counters: {},
  };
}

/** Initial data of the mock platform, computed relative to `now`. */
export function createSeedDatabase(now: Date): MockDatabase {
  const { daysFromNow } = createDateHelpers(now);
  const createdAt = daysFromNow(-300);

  return convertIdsToUuids({
    users: buildUsers(daysFromNow),
    courses: [
      buildJavascriptCourse(createdAt),
      buildDesignCourse(createdAt),
      buildSqlCourse(createdAt),
      buildPhotographyCourse(createdAt),
      buildTimeManagementCourse(createdAt),
    ],
    grants: buildGrants(daysFromNow),
    invites: buildInvites(daysFromNow),
    progress: buildProgress(daysFromNow),
    quizAttempts: buildQuizAttempts(daysFromNow),
    notes: [],
    certificates: buildCertificates(daysFromNow),
    settings: buildSettings(),
    counters: {},
  });
}
