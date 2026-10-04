import { describe, expect, it } from 'vitest';
import { NEUTRAL_COLORS } from '@/theme/neutralColors';
import { brandCss, contrastRatio, deriveBrandTokens, mixColors } from './brandColor';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('mixColors', () => {
  it('blends linearly between two colors', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

describe('deriveBrandTokens', () => {
  it.each(['#2f6f5e', '#ffcc00', '#0000ff', '#ff00ff', '#ffffff', '#000000'])(
    'keeps text readable in both themes for %s',
    (color) => {
      const { light, dark } = deriveBrandTokens(color);
      expect(contrastRatio(light.primary, NEUTRAL_COLORS.lightBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(light.primaryForeground, light.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(light.accentForeground, light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.primary, NEUTRAL_COLORS.darkBackground)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrastRatio(dark.primaryForeground, dark.primary)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark.accentForeground, dark.accent)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('keeps the default brand color untouched in the light theme', () => {
    expect(deriveBrandTokens('#2f6f5e').light.primary).toBe('#2f6f5e');
  });
});

describe('brandCss', () => {
  it('overrides the tokens for the light and dark themes', () => {
    const css = brandCss('#2f6f5e');
    expect(css).toContain(':root{--primary:#2f6f5e');
    expect(css).toContain(':root.dark{--primary:');
  });
});
