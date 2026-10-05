import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors';
import { toLessonColumns } from '../src/modules/courses/lesson-fields';

const quiz = { passingScore: 50, questions: [] };

type Args = Parameters<typeof toLessonColumns>;

describe('toLessonColumns', () => {
  it('turns an external link into a ready video and null into no video', () => {
    expect(toLessonColumns('video', { video: { url: 'https://vimeo.com/1' } })).toEqual({
      video: {
        provider: 'external',
        externalId: 'https://vimeo.com/1',
        status: 'ready',
        playbackUrl: 'https://vimeo.com/1',
      },
    });
    expect(toLessonColumns('video', { video: null })).toEqual({ video: null });
  });

  it('refuses fields that do not belong to the lesson type', () => {
    const cases: Args[] = [
      ['text', { quiz }],
      ['video', { quiz }],
      ['text', { video: null }],
      ['quiz', { captions: [] }],
      ['file', { video: { url: 'https://x.test/v' } }],
    ];
    for (const [type, body] of cases) {
      expect(() => toLessonColumns(type, body)).toThrow(HttpError);
    }
  });

  it('keeps fields every type has, and leaves translations to the caller', () => {
    expect(
      toLessonColumns('text', {
        durationSeconds: 90,
        translations: [{ locale: 'en', title: 'T', content: '' }],
      }),
    ).toEqual({ durationSeconds: 90 });
    expect(toLessonColumns('quiz', { quiz })).toEqual({ quiz });
  });
});
