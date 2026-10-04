import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '@/lib/utils';

/** Progress bar. `value` is a fraction from 0 to 1. */
export function ProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <ProgressPrimitive.Root
      value={percent}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      {/* slides the fill instead of animating width, which would force layout; flips for RTL */}
      <ProgressPrimitive.Indicator
        className="size-full translate-x-[calc(-1*var(--progress-gap))] rounded-full bg-primary transition-transform rtl:translate-x-(--progress-gap)"
        style={{ '--progress-gap': `${100 - percent}%` } as React.CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}
