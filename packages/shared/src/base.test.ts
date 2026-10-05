import { describe, expect, it } from 'vitest';
import { idSchema } from './base';

describe('idSchema', () => {
  it('accepts a UUID', () => {
    expect(idSchema.safeParse('3f2b8a54-6d1e-4c3f-9a7b-2d5e8c1f0a11').success).toBe(true);
  });

  it('rejects readable keys and empty strings', () => {
    expect(idSchema.safeParse('course-js').success).toBe(false);
    expect(idSchema.safeParse('').success).toBe(false);
  });
});
