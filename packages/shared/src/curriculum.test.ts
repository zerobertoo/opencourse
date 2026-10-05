import { describe, expect, it } from 'vitest';
import {
  createLessonRequestSchema,
  createModuleRequestSchema,
  quizInputSchema,
  reorderCurriculumRequestSchema,
  updateLessonRequestSchema,
  updateModuleRequestSchema,
} from './curriculum';

const ids = {
  question: '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e01',
  optionA: '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e02',
  optionB: '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e03',
  module: '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e04',
};

function quiz(optionBId = ids.optionB) {
  return {
    passingScore: 70,
    questions: [
      {
        id: ids.question,
        translations: [{ locale: 'en', prompt: 'Q?', explanation: '' }],
        options: [
          { id: ids.optionA, isCorrect: true, translations: [{ locale: 'en', text: 'Yes' }] },
          { id: optionBId, isCorrect: false, translations: [{ locale: 'en', text: 'No' }] },
        ],
      },
    ],
  };
}

describe('curriculum schemas', () => {
  it('requires a trimmed title and a supported locale for new modules and lessons', () => {
    expect(createModuleRequestSchema.parse({ title: ' Intro ', locale: 'en' })).toEqual({
      title: 'Intro',
      locale: 'en',
    });
    expect(createModuleRequestSchema.safeParse({ title: '  ', locale: 'en' }).success).toBe(false);
    expect(createModuleRequestSchema.safeParse({ title: 'A', locale: 'fr' }).success).toBe(false);
    expect(
      createModuleRequestSchema.safeParse({ title: 'A', locale: 'en', courseId: ids.module })
        .success,
    ).toBe(false);
    expect(
      createLessonRequestSchema.safeParse({ type: 'audio', title: 'A', locale: 'en' }).success,
    ).toBe(false);
  });

  it('rejects module translation lists that repeat a locale or are empty', () => {
    const item = { locale: 'en', title: 'A' };
    expect(updateModuleRequestSchema.safeParse({ translations: [item] }).success).toBe(true);
    expect(updateModuleRequestSchema.safeParse({ translations: [item, item] }).success).toBe(false);
    expect(updateModuleRequestSchema.safeParse({ translations: [] }).success).toBe(false);
  });

  it('requires isCorrect on every option and unique ids inside a quiz', () => {
    expect(quizInputSchema.safeParse(quiz()).success).toBe(true);
    expect(quizInputSchema.safeParse(quiz(ids.optionA)).success).toBe(false);
    const withoutAnswer = quiz();
    delete (withoutAnswer.questions[0]!.options[1] as { isCorrect?: boolean }).isCorrect;
    expect(quizInputSchema.safeParse(withoutAnswer).success).toBe(false);
  });

  it('accepts lesson updates with https video links only, and refuses empty or unknown fields', () => {
    expect(
      updateLessonRequestSchema.safeParse({ video: { url: 'https://youtu.be/x' } }).success,
    ).toBe(true);
    expect(updateLessonRequestSchema.safeParse({ video: null }).success).toBe(true);
    expect(
      updateLessonRequestSchema.safeParse({ video: { url: 'http://youtu.be/x' } }).success,
    ).toBe(false);
    expect(
      updateLessonRequestSchema.safeParse({
        captions: [{ locale: 'en', url: 'javascript:alert(1)' }],
      }).success,
    ).toBe(false);
    expect(updateLessonRequestSchema.safeParse({}).success).toBe(false);
    expect(
      updateLessonRequestSchema.safeParse({ durationSeconds: 1, attachments: [] }).success,
    ).toBe(false);
    expect(updateLessonRequestSchema.safeParse({ durationSeconds: -1 }).success).toBe(false);
  });

  it('accepts a reorder layout of ids only', () => {
    const layout = { modules: [{ moduleId: ids.module, lessonIds: [] }] };
    expect(reorderCurriculumRequestSchema.safeParse(layout).success).toBe(true);
    expect(
      reorderCurriculumRequestSchema.safeParse({ modules: [{ moduleId: 'm1' }] }).success,
    ).toBe(false);
  });
});
