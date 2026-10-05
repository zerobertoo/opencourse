import type { CourseDetail } from '@opencourse/shared';
import { describe, expect, it } from 'vitest';
import { redactQuizAnswers } from '../src/modules/courses/redact';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const course = {
  id: id(1),
  slug: 's',
  status: 'published',
  coverImageUrl: null,
  instructorId: id(2),
  defaultLocale: 'en',
  sequentialOrder: false,
  certificateTemplate: { enabled: true, signatoryName: '', signatoryRole: '', message: '' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  translations: [],
  modules: [
    {
      id: id(3),
      courseId: id(1),
      order: 0,
      translations: [],
      lessons: [
        {
          id: id(4),
          moduleId: id(3),
          order: 0,
          durationSeconds: 0,
          attachments: [],
          translations: [],
          type: 'quiz',
          quiz: {
            passingScore: 70,
            questions: [
              {
                id: id(5),
                translations: [{ locale: 'en', prompt: 'Q', explanation: 'Because B' }],
                options: [
                  { id: id(6), isCorrect: true, translations: [{ locale: 'en', text: 'A' }] },
                  { id: id(7), isCorrect: false, translations: [{ locale: 'en', text: 'B' }] },
                ],
              },
            ],
          },
        },
      ],
    },
  ],
} satisfies CourseDetail;

describe('redactQuizAnswers', () => {
  it('removes correctness and explanations without touching the input', () => {
    const redacted = redactQuizAnswers(course);
    const text = JSON.stringify(redacted);
    expect(text).not.toContain('isCorrect');
    expect(text).not.toContain('Because B');
    expect(redacted.modules[0]?.lessons[0]).toMatchObject({ type: 'quiz' });
    expect(JSON.stringify(course)).toContain('isCorrect');
  });
});
