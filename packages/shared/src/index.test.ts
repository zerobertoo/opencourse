import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, localeSchema, roleSchema } from './index';

describe('shared schemas', () => {
  it('accepts supported locales and rejects unknown ones', () => {
    expect(localeSchema.parse('pt-BR')).toBe('pt-BR');
    expect(localeSchema.safeParse('fr').success).toBe(false);
  });

  it('uses a supported locale as the default', () => {
    expect(localeSchema.safeParse(DEFAULT_LOCALE).success).toBe(true);
  });

  it('validates roles', () => {
    expect(roleSchema.safeParse('admin').success).toBe(true);
    expect(roleSchema.safeParse('owner').success).toBe(false);
  });
});
