import { describe, expect, it } from 'vitest';
import { isSenderAddress, updatePlatformSettingsRequestSchema } from './entities';

describe('isSenderAddress', () => {
  it.each([
    'no-reply@opencourse.local',
    'OpenCourse <no-reply@opencourse.local>',
    '  Acme Academy <hello@acme.test> ',
    '<no-reply@opencourse.local>',
  ])('accepts %j', (value) => {
    expect(isSenderAddress(value)).toBe(true);
  });

  it.each([
    '',
    'nope',
    'OpenCourse <nope>',
    'OpenCourse no-reply@opencourse.local',
    'a@x.test, b@y.test <c@z.test>',
    'Acme; Evil <c@z.test>',
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

  it('stores the sender without the spaces around it', () => {
    const parsed = updatePlatformSettingsRequestSchema.parse({
      email: { fromAddress: '  OpenCourse <no-reply@opencourse.local> ' },
    });
    expect(parsed.email?.fromAddress).toBe('OpenCourse <no-reply@opencourse.local>');
  });

  it('takes only http and https for the logo, or null to clear it', () => {
    const logo = (logoUrl: string | null) =>
      updatePlatformSettingsRequestSchema.safeParse({ brand: { logoUrl } }).success;
    expect(logo('https://cdn.acme.test/logo.png')).toBe(true);
    expect(logo('http://cdn.acme.test/logo.png')).toBe(true);
    expect(logo(null)).toBe(true);
    for (const value of [
      'javascript:alert(1)',
      'data:image/svg+xml,<svg/>',
      'ftp://x.test/a',
      '',
    ]) {
      expect(logo(value)).toBe(false);
    }
  });

  it('refuses keys it does not know, at the top level and inside a group', () => {
    const parses = (body: unknown) => updatePlatformSettingsRequestSchema.safeParse(body).success;
    expect(parses({ foo: 1 })).toBe(false);
    expect(parses({ brand: { name: 'Acme', color: 'red' } })).toBe(false);
    expect(parses({ email: { host: 'smtp.acme.test', password: 'x' } })).toBe(false);
    expect(parses({ brand: { name: 'Acme' } })).toBe(true);
  });

  it('refuses a sender that is not an address', () => {
    expect(
      updatePlatformSettingsRequestSchema.safeParse({ email: { fromAddress: 'nope' } }).success,
    ).toBe(false);
  });
});
