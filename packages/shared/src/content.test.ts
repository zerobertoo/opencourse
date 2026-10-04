import { describe, expect, it } from 'vitest';
import {
  computeGrantStatus,
  flattenLessons,
  getCourseDurationSeconds,
  getIncompleteLocales,
  getTranslationCoverage,
  getUnlockedLessonIds,
  resolveTranslation,
  scoreQuiz,
  summarizeCourseProgress,
  type CourseDetail,
  type Grant,
  type Quiz,
} from './index';

function buildCourse(overrides: Partial<CourseDetail> = {}): CourseDetail {
  const lesson = (id: string, order: number, titles: Record<string, string>) => ({
    id,
    moduleId: 'm1',
    order,
    type: 'text' as const,
    durationSeconds: 60,
    attachments: [],
    translations: Object.entries(titles).map(([locale, title]) => ({
      locale: locale as 'pt-BR' | 'en',
      title,
      content: '',
    })),
  });

  return {
    id: 'c1',
    slug: 'curso',
    status: 'published',
    coverImageUrl: null,
    instructorId: 'u1',
    defaultLocale: 'pt-BR',
    sequentialOrder: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    translations: [
      { locale: 'pt-BR', title: 'Curso', description: '', learningOutcomes: [] },
      { locale: 'en', title: 'Course', description: '', learningOutcomes: [] },
    ],
    modules: [
      {
        id: 'm2',
        courseId: 'c1',
        order: 1,
        translations: [{ locale: 'pt-BR', title: 'Segundo' }],
        lessons: [lesson('l3', 0, { 'pt-BR': 'Três' })],
      },
      {
        id: 'm1',
        courseId: 'c1',
        order: 0,
        translations: [
          { locale: 'pt-BR', title: 'Primeiro' },
          { locale: 'en', title: 'First' },
        ],
        lessons: [
          lesson('l2', 1, { 'pt-BR': 'Dois', en: 'Two' }),
          lesson('l1', 0, { 'pt-BR': 'Um', en: 'One' }),
        ],
      },
    ],
    ...overrides,
  };
}

describe('resolveTranslation', () => {
  const translations = [
    { locale: 'pt-BR' as const, title: 'Olá' },
    { locale: 'en' as const, title: 'Hello' },
  ];

  it('returns the requested locale when it exists', () => {
    expect(resolveTranslation(translations, 'en', 'pt-BR')).toMatchObject({
      locale: 'en',
      isFallback: false,
      translation: { title: 'Hello' },
    });
  });

  it('falls back to the course default locale when the requested one is missing', () => {
    const result = resolveTranslation([translations[0]!], 'en', 'pt-BR');
    expect(result).toMatchObject({ locale: 'pt-BR', isFallback: true });
  });

  it('treats a blank translation as missing', () => {
    const result = resolveTranslation(
      [translations[0]!, { locale: 'en' as const, title: '   ' }],
      'en',
      'pt-BR',
    );
    expect(result?.isFallback).toBe(true);
    expect(result?.translation.title).toBe('Olá');
  });

  it('returns null when neither the requested nor the default locale exist', () => {
    expect(resolveTranslation([translations[1]!], 'pt-BR', 'pt-BR')).toBeNull();
  });
});

describe('translation coverage', () => {
  it('counts translated entities per locale', () => {
    const course = buildCourse();
    // curso + 2 módulos + 3 aulas = 6 entidades traduzíveis
    expect(getTranslationCoverage(course, 'pt-BR')).toMatchObject({
      translated: 6,
      total: 6,
      isComplete: true,
    });
    expect(getTranslationCoverage(course, 'en')).toMatchObject({
      translated: 4,
      total: 6,
      isComplete: false,
    });
    expect(getTranslationCoverage(course, 'en').ratio).toBeCloseTo(4 / 6);
  });

  it('lists only the locales that are incomplete', () => {
    expect(getIncompleteLocales(buildCourse(), ['pt-BR', 'en'])).toEqual(['en']);
  });
});

describe('curriculum helpers', () => {
  it('flattens lessons by module order and lesson order', () => {
    expect(flattenLessons(buildCourse()).map((lesson) => lesson.id)).toEqual(['l1', 'l2', 'l3']);
  });

  it('sums the course duration', () => {
    expect(getCourseDurationSeconds(buildCourse())).toBe(180);
  });

  it('unlocks every lesson when the course is not sequential', () => {
    const unlocked = getUnlockedLessonIds(buildCourse(), new Set());
    expect([...unlocked].sort()).toEqual(['l1', 'l2', 'l3']);
  });

  it('unlocks only up to the first incomplete lesson in sequential courses', () => {
    const course = buildCourse({ sequentialOrder: true });
    expect([...getUnlockedLessonIds(course, new Set())]).toEqual(['l1']);
    expect([...getUnlockedLessonIds(course, new Set(['l1']))]).toEqual(['l1', 'l2']);
    expect([...getUnlockedLessonIds(course, new Set(['l1', 'l2', 'l3']))]).toEqual([
      'l1',
      'l2',
      'l3',
    ]);
  });

  it('summarizes progress and points to the next lesson', () => {
    const summary = summarizeCourseProgress(buildCourse(), new Set(['l1']));
    expect(summary).toMatchObject({
      completedCount: 1,
      totalCount: 3,
      nextLessonId: 'l2',
      isComplete: false,
    });
    expect(summary.percent).toBeCloseTo(1 / 3);

    const done = summarizeCourseProgress(buildCourse(), new Set(['l1', 'l2', 'l3']));
    expect(done).toMatchObject({ percent: 1, isComplete: true, nextLessonId: null });
  });
});

describe('computeGrantStatus', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');
  const baseGrant: Grant = {
    id: 'g1',
    userId: 'u1',
    courseId: 'c1',
    source: 'manual',
    createdById: 'u2',
    createdAt: '2026-01-01T00:00:00.000Z',
    expiresAt: null,
    status: 'active',
  };

  it('treats a grant without expiration as lifetime', () => {
    expect(computeGrantStatus(baseGrant, now)).toBe('active');
  });

  it('expires a grant whose validity has passed', () => {
    expect(computeGrantStatus({ ...baseGrant, expiresAt: '2026-05-31T00:00:00.000Z' }, now)).toBe(
      'expired',
    );
    expect(computeGrantStatus({ ...baseGrant, expiresAt: '2026-06-01T12:00:00.000Z' }, now)).toBe(
      'expired',
    );
  });

  it('keeps a grant active until its expiration', () => {
    expect(computeGrantStatus({ ...baseGrant, expiresAt: '2026-07-01T00:00:00.000Z' }, now)).toBe(
      'active',
    );
  });

  it('keeps revoked grants revoked even when also past their validity', () => {
    expect(
      computeGrantStatus(
        { ...baseGrant, status: 'revoked', expiresAt: '2026-01-02T00:00:00.000Z' },
        now,
      ),
    ).toBe('revoked');
  });
});

describe('scoreQuiz', () => {
  const quiz: Quiz = {
    passingScore: 70,
    questions: ['q1', 'q2', 'q3'].map((id) => ({
      id,
      translations: [{ locale: 'pt-BR', prompt: id, explanation: '' }],
      options: [
        { id: `${id}-a`, isCorrect: true, translations: [{ locale: 'pt-BR', text: 'A' }] },
        { id: `${id}-b`, isCorrect: false, translations: [{ locale: 'pt-BR', text: 'B' }] },
      ],
    })),
  };

  it('passes when the score reaches the minimum', () => {
    const result = scoreQuiz(quiz, { q1: 'q1-a', q2: 'q2-a', q3: 'q3-a' });
    expect(result).toMatchObject({ score: 100, passed: true, correctCount: 3, totalQuestions: 3 });
  });

  it('fails below the minimum and reports each question', () => {
    const result = scoreQuiz(quiz, { q1: 'q1-a', q2: 'q2-b' });
    expect(result.score).toBe(33);
    expect(result.passed).toBe(false);
    expect(result.results.q1).toEqual({
      selectedOptionId: 'q1-a',
      correctOptionId: 'q1-a',
      isCorrect: true,
    });
    expect(result.results.q2?.isCorrect).toBe(false);
    expect(result.results.q3).toMatchObject({ selectedOptionId: null, isCorrect: false });
  });

  it('rounds the score and compares it with the minimum score', () => {
    const result = scoreQuiz(quiz, { q1: 'q1-a', q2: 'q2-a' });
    expect(result.score).toBe(67);
    expect(result.passed).toBe(false);
  });

  it('never passes a quiz without questions', () => {
    expect(scoreQuiz({ passingScore: 0, questions: [] }, {}).passed).toBe(false);
  });
});
