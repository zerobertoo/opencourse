/**
 * Neutral surface colors the brand derivation must read against.
 * Single TypeScript source for the values that also live in `index.css`;
 * `tokens.test.ts` fails if the two drift apart.
 */
export const NEUTRAL_COLORS = {
  lightBackground: '#f6f7f8',
  darkBackground: '#111214',
  /** Text color used on a light primary in the dark theme. */
  darkOnPrimary: '#0d0e10',
} as const;
