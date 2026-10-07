import { describe, expect, it } from 'vitest';
import { externalVideoSchema } from './schemas';

describe('externalVideoSchema', () => {
  it('accepts https links and trims them', () => {
    expect(externalVideoSchema.parse({ url: ' https://videos.example/abc ' })).toEqual({
      url: 'https://videos.example/abc',
    });
  });

  it('refuses http, other protocols and text that is not a link', () => {
    for (const url of ['http://videos.example/abc', 'javascript:1', 'not a link']) {
      const result = externalVideoSchema.safeParse({ url });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('validation.httpsUrl');
    }
  });

  it('asks for the field when it is empty', () => {
    const result = externalVideoSchema.safeParse({ url: '  ' });
    expect(result.error?.issues[0]?.message).toBe('validation.required');
  });
});
