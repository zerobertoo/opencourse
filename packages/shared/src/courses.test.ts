import { describe, expect, it } from 'vitest';
import {
  createCourseRequestSchema,
  listCoursesQuerySchema,
  updateCourseRequestSchema,
} from './courses';

describe('courses schemas', () => {
  it('defaults the list scope to the catalog', () => {
    expect(listCoursesQuerySchema.parse({}).scope).toBe('catalog');
  });

  it('requires a title and a supported locale to create a course', () => {
    expect(
      createCourseRequestSchema.safeParse({ title: ' ', defaultLocale: 'en' }).success,
    ).toBe(false);
    expect(
      createCourseRequestSchema.safeParse({ title: 'Intro', defaultLocale: 'fr' }).success,
    ).toBe(false);
    expect(createCourseRequestSchema.parse({ title: ' Intro ', defaultLocale: 'en' })).toEqual({
      title: 'Intro',
      description: '',
      defaultLocale: 'en',
    });
  });

  it('rejects empty updates, slugs, non-https covers and repeated locales', () => {
    const translation = { locale: 'en', title: 'A', description: '', learningOutcomes: [] };
    expect(updateCourseRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCourseRequestSchema.safeParse({ slug: 'x', status: 'draft' }).success).toBe(false);
    expect(
      updateCourseRequestSchema.safeParse({ coverImageUrl: 'http://x.test/a.png' }).success,
    ).toBe(false);
    expect(
      updateCourseRequestSchema.safeParse({ coverImageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(updateCourseRequestSchema.safeParse({ coverImageUrl: null }).success).toBe(true);
    expect(
      updateCourseRequestSchema.safeParse({ coverImageUrl: 'https://x.test/a.png' }).success,
    ).toBe(true);
    expect(
      updateCourseRequestSchema.safeParse({ translations: [translation, translation] }).success,
    ).toBe(false);
  });
});
