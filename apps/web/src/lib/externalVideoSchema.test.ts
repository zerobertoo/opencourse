import { describe, expect, it } from 'vitest';
import { externalVideoSchema } from './schemas';

describe('externalVideoSchema', () => {
  it('accepts links of a video provider and trims them', () => {
    expect(externalVideoSchema.parse({ url: ' https://youtu.be/dQw4w9WgXcQ ' })).toEqual({
      url: 'https://youtu.be/dQw4w9WgXcQ',
    });
  });

  it('refuses a valid https link that no provider plugin recognises', () => {
    const result = externalVideoSchema.safeParse({ url: 'https://videos.example/abc' });
    expect(result.error?.issues[0]?.message).toBe('validation.videoProvider');
  });

  it('refuses http, other protocols and text that is not a link', () => {
    for (const url of ['http://youtu.be/dQw4w9WgXcQ', 'javascript:1', 'not a link']) {
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
