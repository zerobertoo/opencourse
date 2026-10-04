import {
  resolveTranslation,
  type CourseDetail,
  type CourseModuleWithLessons,
  type Lesson,
  type Locale,
  type QuizOption,
  type QuizQuestion,
} from '@opencourse/shared';

/** Active interface language, restricted to the supported languages. */
export function toLocale(language: string | undefined): Locale {
  return language === 'en' ? 'en' : 'pt-BR';
}

export interface LocalizedCourse {
  title: string;
  description: string;
  learningOutcomes: string[];
  /** True when the content fell back to the course default language. */
  isFallback: boolean;
  /** Language actually displayed. */
  locale: Locale;
}

/** Course content in the requested language, falling back to the course default language. */
export function localizeCourse(course: CourseDetail, locale: Locale): LocalizedCourse {
  const resolved = resolveTranslation(course.translations, locale, course.defaultLocale);
  return {
    title: resolved?.translation.title ?? '',
    description: resolved?.translation.description ?? '',
    learningOutcomes: resolved?.translation.learningOutcomes ?? [],
    isFallback: resolved?.isFallback ?? false,
    locale: resolved?.locale ?? course.defaultLocale,
  };
}

export function localizeModuleTitle(
  courseModule: CourseModuleWithLessons,
  locale: Locale,
  defaultLocale: Locale,
): string {
  return (
    resolveTranslation(courseModule.translations, locale, defaultLocale)?.translation.title ?? ''
  );
}

export interface LocalizedLesson {
  title: string;
  /** Markdown: body of a text lesson or description of the other types. */
  content: string;
  isFallback: boolean;
  locale: Locale;
}

export function localizeLesson(
  lesson: Lesson,
  locale: Locale,
  defaultLocale: Locale,
): LocalizedLesson {
  const resolved = resolveTranslation(lesson.translations, locale, defaultLocale);
  return {
    title: resolved?.translation.title ?? '',
    content: resolved?.translation.content ?? '',
    isFallback: resolved?.isFallback ?? false,
    locale: resolved?.locale ?? defaultLocale,
  };
}

export function localizeQuestion(question: QuizQuestion, locale: Locale, defaultLocale: Locale) {
  const resolved = resolveTranslation(question.translations, locale, defaultLocale);
  return {
    prompt: resolved?.translation.prompt ?? '',
    explanation: resolved?.translation.explanation ?? '',
  };
}

export function localizeOption(option: QuizOption, locale: Locale, defaultLocale: Locale): string {
  return resolveTranslation(option.translations, locale, defaultLocale)?.translation.text ?? '';
}
