/** Brand color helpers: derives accessible theme tokens from a single primary color. */

type Rgb = [number, number, number];

/** Page backgrounds of the two themes (see `index.css`); the brand color must read on them. */
const LIGHT_BACKGROUND = '#f4f6f2';
const DARK_BACKGROUND = '#111613';
const DARK_FOREGROUND = '#0d1a15';
const MIN_TEXT_CONTRAST = 4.5;
const MIX_STEPS = 20;

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16)) as Rgb;
}

export function rgbToHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue].map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** Linear blend: `amount` 0 returns `from`, 1 returns `to`. */
export function mixColors(from: string, to: string, amount: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  return rgbToHex(start.map((channel, index) => channel + (end[index]! - channel) * amount) as Rgb);
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Moves `color` toward `target` just enough to reach AA text contrast against `background`. */
function shiftUntilReadable(color: string, target: string, background: string): string {
  for (let step = 0; step <= MIX_STEPS; step++) {
    const candidate = mixColors(color, target, step / MIX_STEPS);
    if (contrastRatio(candidate, background) >= MIN_TEXT_CONTRAST) return candidate;
  }
  return target;
}

/** Black or white, whichever reads better on `background`. */
function readableForeground(background: string): string {
  return contrastRatio('#ffffff', background) >= contrastRatio(DARK_FOREGROUND, background)
    ? '#ffffff'
    : DARK_FOREGROUND;
}

export interface BrandThemeTokens {
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  ring: string;
}

export interface BrandTokens {
  light: BrandThemeTokens;
  dark: BrandThemeTokens;
}

/** Derives the tokens of both themes from the brand color, keeping text on them at AA contrast. */
export function deriveBrandTokens(primaryColor: string): BrandTokens {
  const lightPrimary = shiftUntilReadable(primaryColor, '#000000', LIGHT_BACKGROUND);
  const lightAccent = mixColors(lightPrimary, '#ffffff', 0.85);

  const darkPrimary = shiftUntilReadable(primaryColor, '#ffffff', DARK_BACKGROUND);
  const darkAccent = mixColors(darkPrimary, DARK_BACKGROUND, 0.8);

  return {
    light: {
      primary: lightPrimary,
      primaryForeground: readableForeground(lightPrimary),
      accent: lightAccent,
      accentForeground: shiftUntilReadable(lightPrimary, '#000000', lightAccent),
      ring: lightPrimary,
    },
    dark: {
      primary: darkPrimary,
      primaryForeground: readableForeground(darkPrimary),
      accent: darkAccent,
      accentForeground: shiftUntilReadable(darkPrimary, '#ffffff', darkAccent),
      ring: darkPrimary,
    },
  };
}

function declarations(tokens: BrandThemeTokens): string {
  return [
    `--primary:${tokens.primary}`,
    `--primary-foreground:${tokens.primaryForeground}`,
    `--accent:${tokens.accent}`,
    `--accent-foreground:${tokens.accentForeground}`,
    `--ring:${tokens.ring}`,
  ].join(';');
}

/** CSS that overrides the primary tokens for both themes. Only hex input is accepted. */
export function brandCss(primaryColor: string): string {
  const tokens = deriveBrandTokens(primaryColor);
  return `:root{${declarations(tokens.light)}}:root.dark{${declarations(tokens.dark)}}`;
}
