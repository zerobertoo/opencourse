import { SUPPORTED_LOCALES, type Locale } from './base';
import type { CourseDetail, Grant, GrantStatus, Lesson, Quiz } from './entities';

// ---------- Content translation ----------

export interface ResolvedTranslation<T> {
  translation: T;
  /** Language actually used. */
  locale: Locale;
  /** True when the requested language was missing and fell back to the course default. */
  isFallback: boolean;
}

/**
 * Resolves a translation with the fallback chain: user language, then course default language.
 * A translation with empty text counts as missing.
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

/** A translation has text when one of its main label fields is filled in. */
function hasText(item: object): boolean {
  const record = item as Record<string, unknown>;
  const label = record.title ?? record.prompt ?? record.text;
  return typeof label === 'string' && label.trim() !== '';
}

/** Every translation list of a course: course, modules, lessons, questions and options. */
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
  /** Fraction from 0 to 1. */
  ratio: number;
  isComplete: boolean;
}

/** How much of the course content is already translated into the given language. */
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

/** What a course list needs from the curriculum, so listing never has to ship the curriculum. */
export interface CourseSummaryStats {
  moduleCount: number;
  lessonCount: number;
  durationSeconds: number;
  /** Supported languages in which the whole course is translated (title down to quiz options). */
  completeLocales: Locale[];
}

export function getCourseSummaryStats(course: CourseDetail): CourseSummaryStats {
  return {
    moduleCount: course.modules.length,
    lessonCount: flattenLessons(course).length,
    durationSeconds: getCourseDurationSeconds(course),
    completeLocales: SUPPORTED_LOCALES.filter(
      (locale) => getTranslationCoverage(course, locale).isComplete,
    ),
  };
}

/** Languages, among the enabled ones, in which the course translation is still incomplete. */
export function getIncompleteLocales(course: CourseDetail, locales: readonly Locale[]): Locale[] {
  return locales.filter((locale) => !getTranslationCoverage(course, locale).isComplete);
}

// ---------- Authoring checks ----------

export type PublishIssue =
  | 'missingTitle'
  | 'noLessons'
  | 'untitledItems'
  | 'invalidQuiz'
  | 'videoNotReady';

/** True when the translation for `locale` exists and has text. */
function hasTextIn(translations: readonly { locale: Locale }[], locale: Locale): boolean {
  return translations.some((item) => item.locale === locale && hasText(item));
}

/** What still blocks a course from being published; an empty list means it is ready. */
export function getPublishIssues(course: CourseDetail): PublishIssue[] {
  const issues = new Set<PublishIssue>();
  const locale = course.defaultLocale;

  if (!hasTextIn(course.translations, locale)) issues.add('missingTitle');
  if (flattenLessons(course).length === 0) issues.add('noLessons');

  for (const courseModule of course.modules) {
    if (!hasTextIn(courseModule.translations, locale)) issues.add('untitledItems');
    for (const lesson of courseModule.lessons) {
      if (!hasTextIn(lesson.translations, locale)) issues.add('untitledItems');
      if (lesson.type === 'video' && lesson.video?.status !== 'ready') issues.add('videoNotReady');
      if (lesson.type === 'quiz' && getQuizIssues(lesson.quiz, locale).length > 0) {
        issues.add('invalidQuiz');
      }
    }
  }
  return [...issues];
}

export type QuizIssueCode =
  | 'noQuestions'
  | 'missingPrompt'
  | 'tooFewOptions'
  | 'missingOptionText'
  | 'noCorrectOption'
  | 'multipleCorrectOptions';

export interface QuizIssue {
  code: QuizIssueCode;
  /** Question the issue belongs to; null for quiz-wide issues. */
  questionId: string | null;
}

/**
 * What makes a quiz unplayable in the course default language: a question needs a prompt, at
 * least two options with text and exactly one correct option.
 */
export function getQuizIssues(quiz: Quiz, defaultLocale: Locale): QuizIssue[] {
  if (quiz.questions.length === 0) return [{ code: 'noQuestions', questionId: null }];

  const issues: QuizIssue[] = [];
  for (const question of quiz.questions) {
    const add = (code: QuizIssueCode) => issues.push({ code, questionId: question.id });
    if (!hasTextIn(question.translations, defaultLocale)) add('missingPrompt');
    if (question.options.length < 2) add('tooFewOptions');
    if (question.options.some((option) => !hasTextIn(option.translations, defaultLocale))) {
      add('missingOptionText');
    }
    const correctCount = question.options.filter((option) => option.isCorrect).length;
    if (correctCount === 0) add('noCorrectOption');
    if (correctCount > 1) add('multipleCorrectOptions');
  }
  return issues;
}

// ---------- Curriculum and progress ----------

/** Course lessons in study order (module, then lesson). */
export function flattenLessons(course: CourseDetail): Lesson[] {
  return [...course.modules]
    .sort((a, b) => a.order - b.order)
    .flatMap((courseModule) => [...courseModule.lessons].sort((a, b) => a.order - b.order));
}

export function getCourseDurationSeconds(course: CourseDetail): number {
  return flattenLessons(course).reduce((total, lesson) => total + lesson.durationSeconds, 0);
}

/**
 * Lessons unlocked for the student. In courses with sequential order, a lesson only unlocks
 * after all the previous ones are completed.
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
  /** Fraction from 0 to 1. */
  percent: number;
  isComplete: boolean;
  /** First lesson not yet completed, in study order. */
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

// ---------- Grants ----------

/** Effective grant status: an active grant past its expiry date is expired. */
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
  /** Score from 0 to 100. */
  score: number;
  passed: boolean;
  correctCount: number;
  totalQuestions: number;
  results: Record<string, QuizQuestionResult>;
}

/** Grades a quiz. An unanswered question counts as wrong. */
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
