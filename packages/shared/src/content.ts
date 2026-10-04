import type { Locale } from './base';
import type { CourseDetail, Grant, GrantStatus, Lesson, Quiz } from './entities';

// ---------- Tradução de conteúdo ----------

export interface ResolvedTranslation<T> {
  translation: T;
  /** Idioma efetivamente usado. */
  locale: Locale;
  /** Verdadeiro quando o idioma pedido não existia e caiu para o padrão do curso. */
  isFallback: boolean;
}

/**
 * Resolve a tradução com a cadeia de fallback: idioma do usuário, depois idioma padrão do curso.
 * Uma tradução com texto vazio conta como ausente.
 */
export function resolveTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  locale: Locale,
  defaultLocale: Locale,
): ResolvedTranslation<T> | null {
  const requested = translations.find((item) => hasText(item) && item.locale === locale);
  if (requested) return { translation: requested, locale, isFallback: false };

  const fallback = translations.find((item) => hasText(item) && item.locale === defaultLocale);
  if (fallback) return { translation: fallback, locale: defaultLocale, isFallback: true };

  return null;
}

/** Uma tradução tem texto quando algum campo de rótulo principal está preenchido. */
function hasText(item: object): boolean {
  const record = item as Record<string, unknown>;
  const label = record.title ?? record.prompt ?? record.text;
  return typeof label === 'string' && label.trim() !== '';
}

/** Todas as listas de tradução de um curso: curso, módulos, aulas, perguntas e alternativas. */
function collectTranslatables(course: CourseDetail): Array<readonly { locale: Locale }[]> {
  const lists: Array<readonly { locale: Locale }[]> = [course.translations];
  for (const courseModule of course.modules) {
    lists.push(courseModule.translations);
    for (const lesson of courseModule.lessons) {
      lists.push(lesson.translations);
      if (lesson.type === 'quiz') {
        for (const question of lesson.quiz.questions) {
          lists.push(question.translations);
          for (const option of question.options) lists.push(option.translations);
        }
      }
    }
  }
  return lists;
}

export interface TranslationCoverage {
  translated: number;
  total: number;
  /** Fração de 0 a 1. */
  ratio: number;
  isComplete: boolean;
}

/** Quanto do conteúdo do curso já está traduzido para o idioma informado. */
export function getTranslationCoverage(course: CourseDetail, locale: Locale): TranslationCoverage {
  const lists = collectTranslatables(course);
  const translated = lists.filter((list) =>
    list.some((item) => item.locale === locale && hasText(item)),
  ).length;
  const total = lists.length;
  return {
    translated,
    total,
    ratio: total === 0 ? 1 : translated / total,
    isComplete: translated === total,
  };
}

/** Idiomas, entre os habilitados, em que o curso ainda tem tradução incompleta. */
export function getIncompleteLocales(course: CourseDetail, locales: readonly Locale[]): Locale[] {
  return locales.filter((locale) => !getTranslationCoverage(course, locale).isComplete);
}

// ---------- Currículo e progresso ----------

/** Aulas do curso na ordem de estudo (módulo, depois aula). */
export function flattenLessons(course: CourseDetail): Lesson[] {
  return [...course.modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((courseModule) => [...courseModule.lessons].sort((a, b) => a.order - b.order));
}

export function getCourseDurationSeconds(course: CourseDetail): number {
  return flattenLessons(course).reduce((total, lesson) => total + lesson.durationSeconds, 0);
}

/**
 * Aulas liberadas para o aluno. Em cursos com ordem sequencial, uma aula só libera
 * depois que todas as anteriores foram concluídas.
 */
export function getUnlockedLessonIds(
  course: CourseDetail,
  completedLessonIds: ReadonlySet<string>,
): Set<string> {
  const lessons = flattenLessons(course);
  if (!course.sequentialOrder) return new Set(lessons.map((lesson) => lesson.id));

  const unlocked = new Set<string>();
  for (const lesson of lessons) {
    unlocked.add(lesson.id);
    if (!completedLessonIds.has(lesson.id)) break;
  }
  return unlocked;
}

export interface CourseProgressSummary {
  completedCount: number;
  totalCount: number;
  /** Fração de 0 a 1. */
  percent: number;
  isComplete: boolean;
  /** Primeira aula ainda não concluída, na ordem de estudo. */
  nextLessonId: string | null;
}

export function summarizeCourseProgress(
  course: CourseDetail,
  completedLessonIds: ReadonlySet<string>,
): CourseProgressSummary {
  const lessons = flattenLessons(course);
  const completedCount = lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length;
  const totalCount = lessons.length;
  return {
    completedCount,
    totalCount,
    percent: totalCount === 0 ? 0 : completedCount / totalCount,
    isComplete: totalCount > 0 && completedCount === totalCount,
    nextLessonId: lessons.find((lesson) => !completedLessonIds.has(lesson.id))?.id ?? null,
  };
}

// ---------- Concessões ----------

/** Status efetivo da concessão: uma concessão ativa com validade vencida está expirada. */
export function computeGrantStatus(grant: Grant, now: Date): GrantStatus {
  if (grant.status === 'revoked') return 'revoked';
  if (grant.expiresAt !== null && new Date(grant.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'active';
}

// ---------- Quiz ----------

export interface QuizQuestionResult {
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
}

export interface QuizScore {
  /** Nota de 0 a 100. */
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  results: Record<string, QuizQuestionResult>;
}

/** Corrige um quiz. Pergunta sem resposta conta como errada. */
export function scoreQuiz(quiz: Quiz, answers: Readonly<Record<string, string>>): QuizScore {
  const results: Record<string, QuizQuestionResult> = {};
  let correctCount = 0;

  for (const question of quiz.questions) {
    const correctOption = question.options.find((option) => option.isCorrect);
    const selectedOptionId = answers[question.id] ?? null;
    const isCorrect = correctOption !== undefined && selectedOptionId === correctOption.id;
    if (isCorrect) correctCount += 1;
    results[question.id] = {
      selectedOptionId,
      correctOptionId: correctOption?.id ?? '',
      isCorrect,
    };
  }

  const totalQuestions = quiz.questions.length;
  const score = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);
  return {
    score,
    passed: totalQuestions > 0 && score >= quiz.passingScore,
    correctCount,
    totalQuestions,
    results,
  };
}
