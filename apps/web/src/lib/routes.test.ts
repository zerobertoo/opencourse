import { describe, expect, it } from 'vitest';
import { routes } from './routes';

describe('routes', () => {
  it('builds the student and Studio addresses', () => {
    expect(routes.course('intro-to-js')).toBe('/courses/intro-to-js');
    expect(routes.lesson('intro-to-js', 'abc')).toBe('/courses/intro-to-js/lessons/abc');
    expect(routes.studioCourse('c1')).toBe('/studio/courses/c1');
    expect(routes.studioCourse('c1', 'content')).toBe('/studio/courses/c1/content');
  });

  it('encodes what is not safe in a path segment', () => {
    expect(routes.course('a/b c')).toBe('/courses/a%2Fb%20c');
  });
});
