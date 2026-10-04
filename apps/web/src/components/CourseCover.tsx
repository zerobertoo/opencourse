import { cn } from '@/lib/utils';
import { generateCoverShapes, type CoverShape } from './coverShapes';

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
