import { cn } from '@/lib/utils';

interface CoverShape {
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

function CoverShapeMark({ shape }: { shape: CoverShape }) {
  const { kind, x, y, size, opacity } = shape;
  if (kind === 'circle') return <circle cx={x} cy={y} r={size / 2} opacity={opacity} />;
  if (kind === 'square') {
    return (
      <rect
        x={x - size / 2}
        y={y - size / 2}
        width={size}
        height={size}
        rx={size / 8}
        opacity={opacity}
      />
    );
  }
  return (
    <rect
      x={x - size}
      y={y - size / 8}
      width={size * 2}
      height={size / 4}
      rx={size / 8}
      opacity={opacity}
    />
  );
}

/**
 * Course cover image. Without an image it draws a generated cover from `seed`
 * (use the course id) so every course still gets its own identity.
 */
export function CourseCover({
  imageUrl,
  seed,
  className,
}: {
  imageUrl: string | null;
  seed: string;
  className?: string;
}) {
  if (imageUrl) {
    // decorative: the course title is always rendered next to the cover
    return <img src={imageUrl} alt={''} className={cn('object-cover', className)} />;
  }
  return (
    <div aria-hidden="true" className={cn('overflow-hidden bg-accent text-primary', className)}>
      <svg
        viewBox="0 0 160 90"
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
        fill="currentColor"
        data-testid="generated-cover"
      >
        {generateCoverShapes(seed).map((shape, index) => (
          <CoverShapeMark key={index} shape={shape} />
        ))}
      </svg>
    </div>
  );
}
