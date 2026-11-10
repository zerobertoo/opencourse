import { describe, expect, it } from 'vitest';
import {
  isSenderAddress,
  platformSettingsSchema,
  updatePlatformSettingsRequestSchema,
} from './settings';

describe('isSenderAddress', () => {
  it.each([
    'no-reply@opencourse.local',
    'OpenCourse <no-reply@opencourse.local>',
    '  Medici Academy <hello@medici.test> ',
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
    'Medici; Evil <c@z.test>',
    'Evil\r\nBcc: x@y.test <a@b.test>',
  ])('refuses %j', (value) => {
    expect(isSenderAddress(value)).toBe(false);
  });
});

describe('brand layout', () => {
  const stored = {
    brand: { name: 'Old', logoUrl: null, primaryColor: '#2f6f5e' },
    enabledLocales: ['pt-BR'],
    defaultLocale: 'pt-BR',
    email: { host: 'h', port: 25, username: '', fromAddress: 'a@b.test', secure: false },
  };

  it('reads settings saved before the field existed as classic', () => {
    expect(platformSettingsSchema.parse(stored).brand.layout).toBe('classic');
  });

  it('does not fill in a layout on a patch, so a save cannot reset the stored one', () => {
    const patch = updatePlatformSettingsRequestSchema.parse({ brand: { name: 'New' } });
    expect(patch.brand).toEqual({ name: 'New' });
  });

  it('refuses an unknown layout', () => {
    expect(
      updatePlatformSettingsRequestSchema.safeParse({ brand: { layout: 'neon' } }).success,
    ).toBe(false);
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
    expect(logo('https://cdn.medici.test/logo.png')).toBe(true);
    expect(logo('http://cdn.medici.test/logo.png')).toBe(true);
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
    expect(parses({ brand: { name: 'Medici', color: 'red' } })).toBe(false);
    expect(parses({ email: { host: 'smtp.medici.test', password: 'x' } })).toBe(false);
    expect(parses({ brand: { name: 'Medici' } })).toBe(true);
  });

  it('refuses a sender that is not an address', () => {
    expect(
      updatePlatformSettingsRequestSchema.safeParse({ email: { fromAddress: 'nope' } }).success,
    ).toBe(false);
  });
});
