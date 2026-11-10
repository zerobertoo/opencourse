import {
  defaultEnabledVideoProviders,
  type Certificate,
  type Grant,
  type Progress,
  type QuizAttempt,
  type User,
} from '@opencourse/shared';
import type { MockDatabase, StoredInvite } from '../store';
import { buildDesignCourse } from './course-design';
import { buildJavascriptCourse } from './course-javascript';
import { buildPhotographyCourse, buildSqlCourse, buildTimeManagementCourse } from './course-others';
import { convertIdsToUuids, demoId } from './ids';

/** Demo users used by the "sign in as student, instructor or admin" buttons. */
export const DEMO_USER_IDS = {
  student: demoId('user-donatello'),
  instructor: demoId('user-michelangelo'),
  admin: demoId('user-leonardo'),
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
    make('user-leonardo', 'Leonardo da Vinci', 'admin', 400),
    make('user-michelangelo', 'Michelangelo Buonarroti', 'instructor', 380),
    make('user-ada', 'Ada Lovelace', 'instructor', 350),
    make('user-donatello', 'Donatello Bardi', 'student', 120),
    make('user-marie', 'Marie Curie', 'student', 110),
    make('user-raphael', 'Raphael Sanzio', 'student', 100),
    make('user-frida', 'Frida Kahlo', 'student', 95),
    make('user-alan', 'Alan Turing', 'student', 80),
    make('user-clarice', 'Clarice Lispector', 'student', 75),
    make('user-alberto', 'Alberto Santos-Dumont', 'student', 60),
    make('user-hipatia', 'Hipátia de Alexandria', 'student', 45),
    make('user-machado', 'Machado de Assis', 'student', 40, { active: false }),
    make('user-nikola', 'Nikola Tesla', 'student', 30),
    make('user-albert', 'Albert Einstein', 'student', 20, {
      locale: 'en',
      timeZone: 'America/New_York',
    }),
  ];
}

const INSTRUCTOR_BY_COURSE: Record<string, string> = {
  'course-javascript': 'user-michelangelo',
  'course-design': 'user-ada',
  'course-sql': 'user-michelangelo',
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
      createdById: INSTRUCTOR_BY_COURSE[courseId] ?? 'user-leonardo',
      createdAt: daysFromNow(-(options.createdDaysAgo ?? 30)),
      expiresAt:
        options.expiresInDays === undefined || options.expiresInDays === null
          ? null
          : daysFromNow(options.expiresInDays),
      status: options.status ?? 'active',
    };
  };

  return [
    grant('user-donatello', 'course-javascript', { createdDaysAgo: 60 }),
    grant('user-donatello', 'course-design', { expiresInDays: 60, createdDaysAgo: 30 }),
    grant('user-donatello', 'course-sql', { source: 'invite', createdDaysAgo: 90 }),
    grant('user-marie', 'course-javascript', { expiresInDays: 90, createdDaysAgo: 40 }),
    grant('user-marie', 'course-sql', { createdDaysAgo: 35 }),
    grant('user-raphael', 'course-javascript', { createdDaysAgo: 70 }),
    grant('user-raphael', 'course-design', { createdDaysAgo: 50 }),
    grant('user-frida', 'course-javascript', { expiresInDays: -10, createdDaysAgo: 80 }),
    grant('user-frida', 'course-sql', { status: 'revoked', createdDaysAgo: 60 }),
    grant('user-alan', 'course-design', { createdDaysAgo: 45 }),
    grant('user-clarice', 'course-javascript', { createdDaysAgo: 55 }),
    grant('user-clarice', 'course-sql', { expiresInDays: 30, createdDaysAgo: 20 }),
    grant('user-alberto', 'course-sql', { createdDaysAgo: 25 }),
    grant('user-hipatia', 'course-design', { expiresInDays: 15, createdDaysAgo: 15 }),
    grant('user-hipatia', 'course-javascript', { source: 'invite', createdDaysAgo: 14 }),
    grant('user-nikola', 'course-javascript', { createdDaysAgo: 18 }),
    grant('user-albert', 'course-javascript', { createdDaysAgo: 12 }),
    grant('user-machado', 'course-sql', { createdDaysAgo: 38 }),
  ];
}

function buildInvites(daysFromNow: (days: number) => string): StoredInvite[] {
  return [
    {
      id: 'invite-1',
      email: 'novo.aluno@opencourse.example',
      courseId: 'course-sql',
      token: 'demo-convite-sql',
      createdById: 'user-michelangelo',
      createdAt: daysFromNow(-2),
      expiresAt: daysFromNow(12),
      status: 'pending',
    },
    {
      id: 'invite-2',
      email: 'convidado.geral@opencourse.example',
      courseId: null,
      token: 'demo-convite-geral',
      createdById: 'user-leonardo',
      createdAt: daysFromNow(-5),
      expiresAt: daysFromNow(9),
      status: 'pending',
    },
    {
      id: 'invite-3',
      email: 'convite.vencido@opencourse.example',
      courseId: 'course-javascript',
      token: 'demo-convite-vencido',
      createdById: 'user-michelangelo',
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
    { userId: 'user-donatello', lessonIds: SQL_ALL, daysAgo: 20 },
    { userId: 'user-donatello', lessonIds: ['les-design-1-1', 'les-design-1-2'], daysAgo: 3 },
    { userId: 'user-donatello', lessonIds: JS_MODULE_1, daysAgo: 1 },
    { userId: 'user-marie', lessonIds: JS_MODULE_1.slice(0, 3), daysAgo: 4 },
    { userId: 'user-marie', lessonIds: ['les-sql-1-1'], daysAgo: 9 },
    {
      userId: 'user-raphael',
      lessonIds: [...JS_MODULE_1, ...JS_MODULE_2, 'les-js-3-1', 'les-js-3-2'],
      daysAgo: 2,
    },
    { userId: 'user-raphael', lessonIds: ['les-design-1-1'], daysAgo: 12 },
    { userId: 'user-frida', lessonIds: JS_MODULE_1.slice(0, 2), daysAgo: 25 },
    {
      userId: 'user-alan',
      lessonIds: ['les-design-1-1', 'les-design-1-2', 'les-design-1-3', 'les-design-1-4'],
      daysAgo: 6,
    },
    { userId: 'user-clarice', lessonIds: ['les-js-1-1'], daysAgo: 30 },
    { userId: 'user-clarice', lessonIds: SQL_ALL.slice(0, 4), daysAgo: 7 },
    { userId: 'user-hipatia', lessonIds: ['les-js-1-1'], daysAgo: 8 },
    { userId: 'user-nikola', lessonIds: [...JS_MODULE_1, ...JS_MODULE_2.slice(0, 2)], daysAgo: 5 },
    { userId: 'user-albert', lessonIds: ['les-js-1-1', 'les-js-1-2'], daysAgo: 10 },
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
    userId: 'user-donatello',
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
      userId: 'user-donatello',
      lessonId: 'les-js-1-4',
      answers: { 'q-js-1': 'q-js-1-a', 'q-js-2': 'q-js-2-a', 'q-js-3': 'q-js-3-a' },
      score: 33,
      passed: false,
      createdAt: daysFromNow(-2),
    },
    {
      id: 'attempt-2',
      userId: 'user-donatello',
      lessonId: 'les-js-1-4',
      answers: { 'q-js-1': 'q-js-1-a', 'q-js-2': 'q-js-2-b', 'q-js-3': 'q-js-3-b' },
      score: 100,
      passed: true,
      createdAt: daysFromNow(-1),
    },
    {
      id: 'attempt-3',
      userId: 'user-donatello',
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
      userId: 'user-donatello',
      courseId: 'course-sql',
      code: 'OC-7K2M-9QXA',
      issuedAt: daysFromNow(-20),
    },
  ];
}

function buildSettings(): MockDatabase['settings'] {
  return {
    brand: { name: 'OpenCourse', logoUrl: null, primaryColor: '#2f6f5e', layout: 'classic' },
    enabledLocales: ['pt-BR', 'en'],
    defaultLocale: 'pt-BR',
    email: {
      host: 'localhost',
      port: 1025,
      username: '',
      fromAddress: 'nao-responda@opencourse.example',
      secure: false,
    },
    video: {
      watermarkEnabled: false,
      singleStreamEnabled: true,
      enabledVideoProviders: [...defaultEnabledVideoProviders],
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
    webhooks: [],
    webhookDeliveries: [],
    apiKeys: [],
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
    webhooks: [],
    webhookDeliveries: [],
    apiKeys: [],
    counters: {},
  });
}
