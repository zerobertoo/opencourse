import { describe, expect, it } from 'vitest';
import { slugify } from '../src/modules/courses/slug';

describe('slugify', () => {
  it('lowercases, strips accents and joins words with dashes', () => {
    expect(slugify('Introdução ao JavaScript!')).toBe('introducao-ao-javascript');
    expect(slugify('  --Hello,   World--  ')).toBe('hello-world');
  });

  it('falls back to "course" when nothing usable is left', () => {
    expect(slugify('🚀🚀')).toBe('course');
    expect(slugify('')).toBe('course');
  });

  it('keeps slugs short without a trailing dash', () => {
    const slug = slugify('word '.repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
