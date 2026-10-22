import { describe, expect, it } from 'vitest';
import { resolveApiFileUrl } from './apiUrl';

describe('resolveApiFileUrl', () => {
  it('points API paths at the API origin', () => {
    expect(resolveApiFileUrl('/api/v1/courses/1/cover/2', 'http://api.test/')).toBe(
      'http://api.test/api/v1/courses/1/cover/2',
    );
  });

  it('leaves other addresses and demo mode alone', () => {
    expect(resolveApiFileUrl('https://cdn.test/a.png', 'http://api.test')).toBe(
      'https://cdn.test/a.png',
    );
    expect(resolveApiFileUrl('/api/v1/courses/1/cover/2', '')).toBe('/api/v1/courses/1/cover/2');
  });
});
