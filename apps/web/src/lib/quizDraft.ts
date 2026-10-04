import type { Locale, Quiz, QuizOption, QuizQuestion } from '@opencourse/shared';
import { arrayMove } from './curriculumLayout';

/** A question always keeps at least this many options (the quiz schema requires it). */
export const MIN_OPTIONS = 2;

let idCounter = 0;

/** Client-side id for a new question or option; the service keeps it as is. */
export function newQuizId(prefix: 'q' | 'o'): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function createOption(locale: Locale): QuizOption {
  return { id: newQuizId('o'), isCorrect: false, translations: [{ locale, text: '' }] };
}

export function createQuestion(locale: Locale): QuizQuestion {
  return {
    id: newQuizId('q'),
    translations: [{ locale, prompt: '', explanation: '' }],
    options: Array.from({ length: MIN_OPTIONS }, () => createOption(locale)),
  };
}

/** Returns the list with the entry for `locale` replaced by `update(current)`, creating it if needed. */
function upsert<T extends { locale: Locale }>(
  items: readonly T[],
  locale: Locale,
  empty: T,
  update: (current: T) => T,
): T[] {
  const exists = items.some((item) => item.locale === locale);
  return exists
    ? items.map((item) => (item.locale === locale ? update(item) : item))
    : [...items, update(empty)];
}

function mapQuestion(
  quiz: Quiz,
  questionId: string,
  change: (question: QuizQuestion) => QuizQuestion,
): Quiz {
  return {
    ...quiz,
    questions: quiz.questions.map((question) =>
      question.id === questionId ? change(question) : question,
    ),
  };
}

export function setPassingScore(quiz: Quiz, passingScore: number): Quiz {
  return { ...quiz, passingScore };
}

export function addQuestion(quiz: Quiz, locale: Locale): Quiz {
  return { ...quiz, questions: [...quiz.questions, createQuestion(locale)] };
}

export function removeQuestion(quiz: Quiz, questionId: string): Quiz {
  return { ...quiz, questions: quiz.questions.filter((question) => question.id !== questionId) };
}

export function moveQuestion(quiz: Quiz, fromIndex: number, toIndex: number): Quiz {
  return { ...quiz, questions: arrayMove(quiz.questions, fromIndex, toIndex) };
}

export function setQuestionText(
  quiz: Quiz,
  questionId: string,
  locale: Locale,
  patch: { prompt?: string; explanation?: string },
): Quiz {
  return mapQuestion(quiz, questionId, (question) => ({
    ...question,
    translations: upsert(
      question.translations,
      locale,
      { locale, prompt: '', explanation: '' },
      (current) => ({ ...current, ...patch }),
    ),
  }));
}

export function addOption(quiz: Quiz, questionId: string, locale: Locale): Quiz {
  return mapQuestion(quiz, questionId, (question) => ({
    ...question,
    options: [...question.options, createOption(locale)],
  }));
}

/** Removes an option; a question never drops below `MIN_OPTIONS`. */
export function removeOption(quiz: Quiz, questionId: string, optionId: string): Quiz {
  return mapQuestion(quiz, questionId, (question) =>
    question.options.length <= MIN_OPTIONS
      ? question
      : { ...question, options: question.options.filter((option) => option.id !== optionId) },
  );
}

export function setOptionText(
  quiz: Quiz,
  questionId: string,
  optionId: string,
  locale: Locale,
  text: string,
): Quiz {
  return mapQuestion(quiz, questionId, (question) => ({
    ...question,
    options: question.options.map((option) =>
      option.id === optionId
        ? {
            ...option,
            translations: upsert(option.translations, locale, { locale, text: '' }, (current) => ({
              ...current,
              text,
            })),
          }
        : option,
    ),
  }));
}

/** Marks one option as the single correct answer of the question. */
export function setCorrectOption(quiz: Quiz, questionId: string, optionId: string): Quiz {
  return mapQuestion(quiz, questionId, (question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option, isCorrect: option.id === optionId })),
  }));
}

/** Text of a question in a language (empty when it is not translated yet). */
export function getQuestionText(question: QuizQuestion, locale: Locale) {
  return (
    question.translations.find((item) => item.locale === locale) ?? {
      locale,
      prompt: '',
      explanation: '',
    }
  );
}

export function getOptionText(option: QuizOption, locale: Locale): string {
  return option.translations.find((item) => item.locale === locale)?.text ?? '';
}
