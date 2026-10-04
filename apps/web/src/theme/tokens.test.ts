import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');

/** Lê as variáveis de um bloco (`:root` ou `.dark`) do CSS de tokens. */
function readTokens(selector: string): Record<string, string> {
  const block =
    css.match(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [match[1]!, match[2]!]),
  );
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string) {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

const PAIRS: Array<[string, string]> = [
  ['foreground', 'background'],
  ['surface-foreground', 'surface'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'muted'],
  ['primary-foreground', 'primary'],
  ['primary', 'background'],
  ['accent-foreground', 'accent'],
  ['destructive-foreground', 'destructive'],
  ['destructive', 'background'],
];

describe('design tokens', () => {
  it('keeps the brand colors required by the spec', () => {
    const light = readTokens(':root');
    expect(light.primary?.toLowerCase()).toBe('#2f6f5e');
    expect(light.background?.toLowerCase()).toBe('#f4f6f2');
  });

  it('defines every light token in the dark theme too', () => {
    const lightKeys = Object.keys(readTokens(':root')).filter((key) => key !== 'radius');
    const darkKeys = Object.keys(readTokens('.dark'));
    expect(darkKeys.sort()).toEqual(lightKeys.sort());
  });

  describe.each([':root', '.dark'])('%s contrast (WCAG AA)', (selector) => {
    const tokens = readTokens(selector);
    it.each(PAIRS)('%s on %s is at least 4.5:1', (foreground, background) => {
      expect(contrast(tokens[foreground]!, tokens[background]!)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
