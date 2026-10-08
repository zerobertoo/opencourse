import type {
  CourseDetail,
  CourseModuleWithLessons,
  CourseTranslation,
  FileAttachment,
  Lesson,
  Locale,
  QuizQuestion,
} from '@opencourse/shared';

/** Text by language; missing languages stay untranslated (useful for partial courses). */
export type ByLocale<T> = Partial<Record<Locale, T>>;

function entries<T>(byLocale: ByLocale<T>): Array<[Locale, T]> {
  return Object.entries(byLocale) as Array<[Locale, T]>;
}

interface LessonCommon {
  id: string;
  durationSeconds: number;
  title: ByLocale<string>;
  /** Lesson Markdown or its description. */
  content: ByLocale<string>;
  attachments?: FileAttachment[];
}

type LessonContext = { moduleId: string; order: number };

function lessonBase(common: LessonCommon, context: LessonContext) {
  const locales = new Set([
    ...Object.keys(common.title),
    ...Object.keys(common.content),
  ]) as Set<Locale>;
  return {
    id: common.id,
    moduleId: context.moduleId,
    order: context.order,
    durationSeconds: common.durationSeconds,
    attachments: common.attachments ?? [],
    translations: [...locales].map((locale) => ({
      locale,
      title: common.title[locale] ?? '',
      content: common.content[locale] ?? '',
    })),
  };
}

export type LessonSpec = (context: LessonContext) => Lesson;

/** Video lesson. The media is a placeholder served by the app; captions per language. */
export function videoLesson(common: LessonCommon & { captions?: Locale[] }): LessonSpec {
  return (context) => ({
    ...lessonBase(common, context),
    type: 'video',
    video: {
      provider: 'local',
      assetId: common.id,
      status: 'ready',
      errorMessage: null,
      durationSeconds: common.durationSeconds,
    },
    captions: (common.captions ?? ['pt-BR']).map((locale) => ({
      locale,
      url: `${import.meta.env.BASE_URL}media/captions/${common.id}.${locale}.vtt`,
    })),
  });
}

export function textLesson(common: LessonCommon): LessonSpec {
  return (context) => ({ ...lessonBase(common, context), type: 'text' });
}

export function fileLesson(common: LessonCommon): LessonSpec {
  return (context) => ({ ...lessonBase(common, context), type: 'file' });
}

export function quizLesson(
  common: LessonCommon & { passingScore: number; questions: QuizQuestion[] },
): LessonSpec {
  return (context) => ({
    ...lessonBase(common, context),
    type: 'quiz',
    quiz: { passingScore: common.passingScore, questions: common.questions },
  });
}

/** Multiple-choice question; `correct` marks the right option. */
export function question(
  id: string,
  text: ByLocale<{ prompt: string; explanation: string }>,
  options: Array<{ id: string; correct?: true; text: ByLocale<string> }>,
): QuizQuestion {
  return {
    id,
    translations: entries(text).map(([locale, value]) => ({ locale, ...value })),
    options: options.map((option) => ({
      id: option.id,
      isCorrect: option.correct === true,
      translations: entries(option.text).map(([locale, value]) => ({ locale, text: value })),
    })),
  };
}

export function attachment(id: string, name: string, sizeBytes: number): FileAttachment {
  return { id, name, sizeBytes, url: `${import.meta.env.BASE_URL}media/files/${name}` };
}

export function courseModule(
  id: string,
  courseId: string,
  order: number,
  title: ByLocale<string>,
  lessons: LessonSpec[],
): CourseModuleWithLessons {
  return {
    id,
    courseId,
    order,
    translations: entries(title).map(([locale, value]) => ({ locale, title: value })),
    lessons: lessons.map((build, index) => build({ moduleId: id, order: index })),
  };
}

export function courseTranslations(
  byLocale: ByLocale<Omit<CourseTranslation, 'locale'>>,
): CourseTranslation[] {
  return entries(byLocale).map(([locale, value]) => ({ locale, ...value }));
}

export type CourseBase = Omit<CourseDetail, 'modules'>;

/** Certificate template signed by the course instructor. */
export function certificateTemplate(signatoryName: string): CourseDetail['certificateTemplate'] {
  return { enabled: true, signatoryName, signatoryRole: 'Instrutor', message: '' };
}
