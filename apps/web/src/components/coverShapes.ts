/** Deterministic shape layout for generated course covers. */
export interface CoverShape {
  kind: 'circle' | 'square' | 'bar';
  x: number;
  y: number;
  size: number;
  opacity: number;
}

/** Small deterministic PRNG (mulberry32) so a seed always draws the same cover. */
function createRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Flat composition of accent-colored shapes, stable for a given seed. */
export function generateCoverShapes(seed: string): CoverShape[] {
  const random = createRandom(seed);
  const kinds: CoverShape['kind'][] = ['circle', 'square', 'bar'];
  return Array.from({ length: 5 }, (_, index) => ({
    kind: kinds[Math.floor(random() * kinds.length)]!,
    x: Math.round(random() * 160),
    y: Math.round(random() * 90),
    // the first shape is the large anchor of the composition
    size: Math.round(index === 0 ? 46 + random() * 24 : 14 + random() * 30),
    opacity: Number((index === 0 ? 0.35 + random() * 0.3 : 0.12 + random() * 0.3).toFixed(2)),
  }));
}
