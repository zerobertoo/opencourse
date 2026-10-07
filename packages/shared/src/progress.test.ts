import { describe, expect, it } from 'vitest';
import {
  courseDetailSchema,
  gradeQuiz,
  saveNoteRequestSchema,
  submitQuizRequestSchema,
  updateProgressRequestSchema,
} from './index';

const questionId = '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e11';
const optionId = '7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e12';

describe('progress schemas', () => {
  it('needs at least one field to update progress', () => {
    expect(updateProgressRequestSchema.safeParse({}).success).toBe(false);
    expect(updateProgressRequestSchema.safeParse({ completed: true }).success).toBe(true);
    expect(updateProgressRequestSchema.safeParse({ videoPositionSeconds: 12 }).success).toBe(true);
  });

  it('rejects unknown fields, negative and fractional positions', () => {
    expect(updateProgressRequestSchema.safeParse({ completed: true, userId: 'x' }).success).toBe(
      false,
    );
    expect(updateProgressRequestSchema.safeParse({ videoPositionSeconds: -1 }).success).toBe(false);
    expect(updateProgressRequestSchema.safeParse({ videoPositionSeconds: 1.5 }).success).toBe(
      false,
    );
  });

  it('takes quiz answers keyed by question id with option ids as values', () => {
    expect(submitQuizRequestSchema.safeParse({ answers: { [questionId]: optionId } }).success).toBe(
      true,
    );
    expect(submitQuizRequestSchema.safeParse({ answers: { q1: optionId } }).success).toBe(false);
    expect(submitQuizRequestSchema.safeParse({ answers: { [questionId]: 'b' } }).success).toBe(
      false,
    );
    expect(submitQuizRequestSchema.safeParse({ answers: {}, score: 100 }).success).toBe(false);
  });

  it('caps the note size and accepts empty text (it erases the note)', () => {
    expect(saveNoteRequestSchema.safeParse({ content: '' }).success).toBe(true);
    expect(saveNoteRequestSchema.safeParse({ content: 'x'.repeat(20001) }).success).toBe(false);
  });

  it('carries the instructor in the course detail without requiring it', () => {
    const base = {
      id: questionId,
      slug: 'c',
      status: 'draft',
      coverImageUrl: null,
      instructorId: optionId,
      defaultLocale: 'en',
      sequentialOrder: false,
      certificateTemplate: { enabled: true, signatoryName: '', signatoryRole: '', message: '' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      translations: [],
      modules: [],
    };
    expect(courseDetailSchema.safeParse(base).success).toBe(true);
    const withInstructor = courseDetailSchema.parse({
      ...base,
      instructor: { id: optionId, name: 'Ines' },
    });
    expect(withInstructor.instructor?.name).toBe('Ines');
  });

  describe('gradeQuiz', () => {
    const [q1, q2, a1, b1, a2, b2] = [1, 2, 3, 4, 5, 6].map(
      (n) => `7f6f0b0e-9a52-4a3c-9a43-0d0b7c1d2e${String(n).padStart(2, '0')}`,
    );
    const option = (id: string, isCorrect: boolean) => ({
      id,
      isCorrect,
      translations: [{ locale: 'en' as const, text: id }],
    });
    const quiz = {
      passingScore: 50,
      questions: [
        {
          id: q1!,
          translations: [{ locale: 'en' as const, prompt: 'P1', explanation: 'Because 1' }],
          options: [option(a1!, true), option(b1!, false)],
        },
        {
          id: q2!,
          translations: [{ locale: 'en' as const, prompt: 'P2', explanation: 'Because 2' }],
          options: [option(a2!, true), option(b2!, false)],
        },
      ],
    };

    it('keeps the right option secret while the attempt fails', () => {
      const feedback = gradeQuiz(quiz, { [q1!]: b1!, [q2!]: b2! });
      expect(feedback).toMatchObject({ score: 0, passed: false, correctCount: 0 });
      expect(feedback.results[q1!]).toEqual({
        selectedOptionId: b1,
        isCorrect: false,
        explanation: [{ locale: 'en', text: 'Because 1' }],
      });
      expect(JSON.stringify(feedback)).not.toContain(a1!);
    });

    it('reveals the right options once the attempt passes', () => {
      const feedback = gradeQuiz(quiz, { [q1!]: a1!, [q2!]: b2! });
      expect(feedback).toMatchObject({ score: 50, passed: true, correctCount: 1 });
      expect(feedback.results[q1!]?.correctOptionId).toBe(a1);
      expect(feedback.results[q2!]).toMatchObject({ isCorrect: false, correctOptionId: a2 });
    });
  });
});
