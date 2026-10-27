import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors';
import { toLessonColumns } from '../src/modules/courses/lesson-fields';

const quiz = { passingScore: 50, questions: [] };
const enabled = ['youtube', 'vimeo'];

type Args = [Parameters<typeof toLessonColumns>[0], Parameters<typeof toLessonColumns>[1]];

describe('toLessonColumns', () => {
  it('turns a provider link into a ready video and null into no video', () => {
    expect(
      toLessonColumns('video', { video: { url: 'https://vimeo.com/76979871' } }, enabled),
    ).toEqual({
      video: {
        provider: 'external',
        plugin: 'vimeo',
        externalId: '76979871',
        embedUrl: 'https://player.vimeo.com/video/76979871',
        status: 'ready',
      },
    });
    expect(() =>
      toLessonColumns('video', { video: { url: 'https://example.com/a' } }, enabled),
    ).toThrow(HttpError);
    expect(toLessonColumns('video', { video: null }, enabled)).toEqual({ video: null });
  });

  it('refuses a link from a provider that is turned off', () => {
    const link = { video: { url: 'https://youtu.be/dQw4w9WgXcQ' } };
    expect(() => toLessonColumns('video', link, ['vimeo'])).toThrow(
      'This video provider is turned off in the platform settings',
    );
    expect(toLessonColumns('video', link, ['youtube'])).toHaveProperty('video.plugin', 'youtube');
  });

  it('refuses fields that do not belong to the lesson type', () => {
    const cases: Args[] = [
      ['text', { quiz }],
      ['video', { quiz }],
      ['text', { video: null }],
      ['quiz', { captions: [] }],
      ['file', { video: { url: 'https://youtu.be/dQw4w9WgXcQ' } }],
    ];
    for (const [type, body] of cases) {
      expect(() => toLessonColumns(type, body, enabled)).toThrow(HttpError);
    }
  });

  it('keeps fields every type has, and leaves translations to the caller', () => {
    expect(
      toLessonColumns(
        'text',
        { durationSeconds: 90, translations: [{ locale: 'en', title: 'T', content: '' }] },
        enabled,
      ),
    ).toEqual({ durationSeconds: 90 });
    expect(toLessonColumns('quiz', { quiz }, enabled)).toEqual({ quiz });
  });
});
