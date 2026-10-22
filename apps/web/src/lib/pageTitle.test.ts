import { describe, expect, it } from 'vitest';
import { pageTitleKey } from './pageTitle';

describe('pageTitleKey', () => {
  it.each([
    ['/', 'home'],
    ['/login', 'login'],
    ['/courses/js-basics', 'course'],
    ['/courses/js-basics/lessons/abc', 'lesson'],
    ['/studio', 'studioDashboard'],
    ['/studio/courses/abc', 'courseEditor'],
    ['/studio/courses/abc/students', 'courseEditor'],
    ['/admin/api-keys', 'adminApiKeys'],
    ['/nowhere', 'notFound'],
  ])('names %s as %s', (pathname, key) => {
    expect(pageTitleKey(pathname)).toBe(key);
  });
});
