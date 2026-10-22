import { describe, expect, it } from 'vitest';
import { getPostLoginPath } from './AuthContext';

describe('getPostLoginPath', () => {
  it('sends each role to its own home when nothing was requested', () => {
    expect(getPostLoginPath(null, 'student')).toBe('/');
    expect(getPostLoginPath(null, 'instructor')).toBe('/studio');
    expect(getPostLoginPath(null, 'admin')).toBe('/admin');
  });

  it('keeps the root from sending staff to the student home', () => {
    expect(getPostLoginPath({ from: '/' }, 'instructor')).toBe('/studio');
    expect(getPostLoginPath({ from: '/' }, 'admin')).toBe('/admin');
  });

  it('returns to the page that required the sign-in', () => {
    expect(getPostLoginPath({ from: '/courses/sql' }, 'instructor')).toBe('/courses/sql');
  });

  it('ignores external or malformed destinations', () => {
    expect(getPostLoginPath({ from: '//evil.example' }, 'admin')).toBe('/admin');
    expect(getPostLoginPath({ from: 'https://evil.example' }, 'student')).toBe('/');
  });
});
