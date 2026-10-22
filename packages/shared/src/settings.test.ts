import { describe, expect, it } from 'vitest';
import { isSenderAddress, updatePlatformSettingsRequestSchema } from './entities';

describe('isSenderAddress', () => {
  it.each([
    'no-reply@opencourse.local',
    'OpenCourse <no-reply@opencourse.local>',
    '  Acme Academy <hello@acme.test> ',
  ])('accepts %j', (value) => {
    expect(isSenderAddress(value)).toBe(true);
  });

  it.each([
    '',
    'nope',
    'OpenCourse <nope>',
    '<no-reply@opencourse.local>',
    'OpenCourse no-reply@opencourse.local',
    'Evil\r\nBcc: x@y.test <a@b.test>',
  ])('refuses %j', (value) => {
    expect(isSenderAddress(value)).toBe(false);
  });
});

describe('updatePlatformSettingsRequestSchema', () => {
  it('takes the display-name form for the sender', () => {
    const parsed = updatePlatformSettingsRequestSchema.safeParse({
      email: { fromAddress: 'OpenCourse <no-reply@opencourse.local>' },
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses a sender that is not an address', () => {
    expect(
      updatePlatformSettingsRequestSchema.safeParse({ email: { fromAddress: 'nope' } }).success,
    ).toBe(false);
  });
});
