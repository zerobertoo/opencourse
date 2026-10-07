import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locale, Quiz, Role } from '@opencourse/shared';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { hashPassword } from '../auth/passwords';
import type { Database } from '../plugins/db';
import * as schema from './schema';
import {
  courses,
  courseTranslations,
  grants,
  lessons,
  lessonTranslations,
  moduleTranslations,
  modules,
  users,
} from './schema';

/** Development password shared by every demo account. Never used outside development. */
export const DEMO_PASSWORD = 'demo-password-123';

export const DEMO_ACCOUNTS: ReadonlyArray<{ email: string; name: string; role: Role }> = [
  { email: 'admin@opencourse.example', name: 'Marina Albuquerque', role: 'admin' },
  { email: 'instructor@opencourse.example', name: 'Rafael Teixeira', role: 'instructor' },
  { email: 'student@opencourse.example', name: 'Lucas Ferreira', role: 'student' },
  { email: 'student2@opencourse.example', name: 'Camila Duarte', role: 'student' },
];

type Titles = Record<Locale, string>;

interface LessonSeed {
  type: 'video' | 'text' | 'quiz';
  title: Titles;
  content?: Titles;
  durationSeconds: number;
  /** External https link of a video lesson. */
  videoUrl?: string;
  quiz?: { question: Titles; right: Titles; wrong: Titles };
}

interface CourseSeed {
  slug: string;
  status: 'published' | 'draft';
  title: Titles;
  description: Titles;
  modules: Array<{ title: Titles; lessons: LessonSeed[] }>;
}

const LOCALES: Locale[] = ['en', 'pt-BR'];
const DAY_MS = 24 * 60 * 60 * 1000;

const text = (title: Titles, content: Titles, durationSeconds = 300): LessonSeed => ({
  type: 'text',
  title,
  content,
  durationSeconds,
});

const COURSES: CourseSeed[] = [
  {
    slug: 'demo-javascript-basics',
    status: 'published',
    title: { en: 'JavaScript Basics', 'pt-BR': 'Fundamentos de JavaScript' },
    description: {
      en: 'Variables, functions and the first steps with the language.',
      'pt-BR': 'Variáveis, funções e os primeiros passos com a linguagem.',
    },
    modules: [
      {
        title: { en: 'Getting started', 'pt-BR': 'Primeiros passos' },
        lessons: [
          {
            type: 'video',
            title: { en: 'Welcome', 'pt-BR': 'Boas-vindas' },
            content: { en: 'What you will build.', 'pt-BR': 'O que você vai construir.' },
            durationSeconds: 600,
            // the player uses a plain <video> element, so the link must be a direct video file
            videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          },
          text(
            { en: 'Variables', 'pt-BR': 'Variáveis' },
            {
              en: 'Use `let` and `const` to name values.',
              'pt-BR': 'Use `let` e `const` para dar nome aos valores.',
            },
          ),
          {
            type: 'quiz',
            title: { en: 'Check your understanding', 'pt-BR': 'Teste o que aprendeu' },
            durationSeconds: 300,
            quiz: {
              question: {
                en: 'Which keyword declares a constant?',
                'pt-BR': 'Qual palavra declara uma constante?',
              },
              right: { en: 'const', 'pt-BR': 'const' },
              wrong: { en: 'var', 'pt-BR': 'var' },
            },
          },
        ],
      },
      {
        title: { en: 'Going further', 'pt-BR': 'Indo além' },
        lessons: [
          text(
            { en: 'Functions', 'pt-BR': 'Funções' },
            { en: 'Functions package behavior.', 'pt-BR': 'Funções empacotam comportamento.' },
          ),
          text(
            { en: 'Arrays', 'pt-BR': 'Arrays' },
            { en: 'Lists of values.', 'pt-BR': 'Listas de valores.' },
          ),
        ],
      },
    ],
  },
  {
    slug: 'demo-sql-basics',
    status: 'published',
    title: { en: 'SQL Basics', 'pt-BR': 'Fundamentos de SQL' },
    description: {
      en: 'Ask questions of a database with SELECT.',
      'pt-BR': 'Faça perguntas a um banco de dados com SELECT.',
    },
    modules: [
      {
        title: { en: 'First queries', 'pt-BR': 'Primeiras consultas' },
        lessons: [
          text(
            { en: 'Your first SELECT', 'pt-BR': 'Seu primeiro SELECT' },
            { en: 'Reading rows from a table.', 'pt-BR': 'Lendo linhas de uma tabela.' },
          ),
          text(
            { en: 'Filtering with WHERE', 'pt-BR': 'Filtrando com WHERE' },
            { en: 'Keep only the rows you need.', 'pt-BR': 'Fique só com as linhas necessárias.' },
          ),
          {
            type: 'quiz',
            title: { en: 'SQL quiz', 'pt-BR': 'Quiz de SQL' },
            durationSeconds: 300,
            quiz: {
              question: {
                en: 'Which clause filters rows?',
                'pt-BR': 'Qual cláusula filtra linhas?',
              },
              right: { en: 'WHERE', 'pt-BR': 'WHERE' },
              wrong: { en: 'ORDER BY', 'pt-BR': 'ORDER BY' },
            },
          },
        ],
      },
    ],
  },
  {
    slug: 'demo-photography-draft',
    status: 'draft',
    title: {
      en: 'Photography for Beginners (draft)',
      'pt-BR': 'Fotografia para iniciantes (rascunho)',
    },
    description: {
      en: 'A course still being written.',
      'pt-BR': 'Um curso ainda em construção.',
    },
    modules: [
      {
        title: { en: 'Light', 'pt-BR': 'Luz' },
        lessons: [
          text(
            { en: 'Natural light', 'pt-BR': 'Luz natural' },
            { en: 'Shooting by the window.', 'pt-BR': 'Fotografando perto da janela.' },
          ),
        ],
      },
    ],
  },
];

function buildQuiz(spec: NonNullable<LessonSeed['quiz']>): Quiz {
  const options = (title: Titles) => LOCALES.map((locale) => ({ locale, text: title[locale] }));
  return {
    passingScore: 70,
    questions: [
      {
        id: randomUUID(),
        translations: LOCALES.map((locale) => ({
          locale,
          prompt: spec.question[locale],
          explanation: '',
        })),
        options: [
          { id: randomUUID(), isCorrect: true, translations: options(spec.right) },
          { id: randomUUID(), isCorrect: false, translations: options(spec.wrong) },
        ],
      },
    ],
  };
}

/**
 * Throws when the environment looks like production: demo accounts share a public password.
 * `ALLOW_DEMO_SEED=true` is the explicit opt-in for a throwaway deployment (a test server).
 */
export function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'db:seed:demo refuses to run when NODE_ENV=production (set ALLOW_DEMO_SEED=true to override)',
    );
  }
}

/**
 * Creates the demo accounts, courses and grants. Idempotent: an account or course that already
 * exists (same e-mail or slug) is left exactly as it is, and a user/course pair that already has a
 * grant gets no second one, so running it again, or over real data, never overwrites anything.
 */
export async function seedDemoData(db: Database): Promise<void> {
  // hashed first: argon2 is slow and must not hold a transaction open
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = Date.now();

  await db.transaction(async (tx) => {
    for (const account of DEMO_ACCOUNTS) {
      await tx
        .insert(users)
        .values({ ...account, passwordHash, locale: 'en', timeZone: 'UTC' })
        .onConflictDoNothing({ target: users.email });
    }
    const idOf = async (email: string) => {
      const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (!row) throw new Error(`Demo account missing: ${email}`);
      return row.id;
    };
    const instructorId = await idOf('instructor@opencourse.example');

    for (const spec of COURSES) {
      const [course] = await tx
        .insert(courses)
        .values({
          slug: spec.slug,
          status: spec.status,
          instructorId,
          defaultLocale: 'en',
          certificateTemplate: {
            enabled: true,
            signatoryName: 'Rafael Teixeira',
            signatoryRole: '',
            message: '',
          },
        })
        .onConflictDoNothing({ target: courses.slug })
        .returning({ id: courses.id });
      // the course exists already: it may have been edited, so its content is not touched
      if (!course) continue;

      await tx.insert(courseTranslations).values(
        LOCALES.map((locale) => ({
          courseId: course.id,
          locale,
          title: spec.title[locale],
          description: spec.description[locale],
          learningOutcomes: [],
        })),
      );
      for (const [moduleIndex, moduleSpec] of spec.modules.entries()) {
        const [created] = await tx
          .insert(modules)
          .values({ courseId: course.id, position: moduleIndex })
          .returning({ id: modules.id });
        if (!created) throw new Error('Failed to seed module');
        await tx.insert(moduleTranslations).values(
          LOCALES.map((locale) => ({
            moduleId: created.id,
            locale,
            title: moduleSpec.title[locale],
          })),
        );

        for (const [lessonIndex, lessonSpec] of moduleSpec.lessons.entries()) {
          const [lesson] = await tx
            .insert(lessons)
            .values({
              moduleId: created.id,
              position: lessonIndex,
              type: lessonSpec.type,
              durationSeconds: lessonSpec.durationSeconds,
              video: lessonSpec.videoUrl
                ? {
                    provider: 'external',
                    externalId: lessonSpec.videoUrl,
                    status: 'ready',
                    playbackUrl: lessonSpec.videoUrl,
                  }
                : null,
              quiz: lessonSpec.quiz ? buildQuiz(lessonSpec.quiz) : null,
            })
            .returning({ id: lessons.id });
          if (!lesson) throw new Error('Failed to seed lesson');
          await tx.insert(lessonTranslations).values(
            LOCALES.map((locale) => ({
              lessonId: lesson.id,
              locale,
              title: lessonSpec.title[locale],
              content: lessonSpec.content?.[locale] ?? '',
            })),
          );
        }
      }
    }

    const courseId = async (slug: string) => {
      const [row] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.slug, slug));
      if (!row) throw new Error(`Demo course missing: ${slug}`);
      return row.id;
    };
    const days = (count: number) => new Date(now + count * DAY_MS);
    const grantSpecs = [
      { email: 'student@opencourse.example', slug: 'demo-javascript-basics' },
      { email: 'student@opencourse.example', slug: 'demo-sql-basics', expiresAt: days(30) },
      { email: 'student2@opencourse.example', slug: 'demo-sql-basics', expiresAt: days(-10) },
      { email: 'student2@opencourse.example', slug: 'demo-javascript-basics', revokedAt: days(-5) },
    ];
    for (const spec of grantSpecs) {
      const userId = await idOf(spec.email);
      const targetCourseId = await courseId(spec.slug);
      const [existing] = await tx
        .select({ id: grants.id })
        .from(grants)
        .where(and(eq(grants.userId, userId), eq(grants.courseId, targetCourseId)));
      if (existing) continue;
      await tx.insert(grants).values({
        userId,
        courseId: targetCourseId,
        source: 'manual',
        createdById: instructorId,
        expiresAt: spec.expiresAt ?? null,
        revokedAt: spec.revokedAt ?? null,
      });
    }
  });
}

/**
 * Undoes `seedDemoData`: deletes the demo courses (and with them modules, lessons, grants,
 * progress and certificates) and then the demo accounts (with their sessions, notes and grants).
 * Anything else is left alone. It fails, changing nothing, when real data still points at a demo
 * account (a course it instructs, an invite or grant it created).
 */
export async function removeDemoData(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(courses).where(
      inArray(
        courses.slug,
        COURSES.map((spec) => spec.slug),
      ),
    );
    await tx.delete(users).where(
      inArray(
        users.email,
        DEMO_ACCOUNTS.map((account) => account.email),
      ),
    );
  });
}

/** Opens its own connection, refusing first when the environment looks like production. */
export async function runSeedDemo(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  mode: 'seed' | 'remove' = 'seed',
): Promise<void> {
  assertNotProduction(env);
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    await (mode === 'remove' ? removeDemoData(db) : seedDemoData(db));
  } finally {
    await client.end();
  }
}

// run as a script (`pnpm --filter @opencourse/api db:seed:demo`, add `--remove` to undo it)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required to seed the demo data');
    process.exit(1);
  }
  const remove = process.argv.includes('--remove');
  runSeedDemo(databaseUrl, process.env, remove ? 'remove' : 'seed')
    .then(() => {
      if (remove) return console.log('Demo accounts and courses removed.');
      console.log('Demo data ready. Sign in with any of these accounts:');
      for (const account of DEMO_ACCOUNTS)
        console.log(`  ${account.role.padEnd(10)} ${account.email}`);
      console.log(`Password for all of them (development only): ${DEMO_PASSWORD}`);
    })
    .catch((error: unknown) => {
      console.error('Seeding failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
