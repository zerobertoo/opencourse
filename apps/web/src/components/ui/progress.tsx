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
      <ProgressPrimitive.Indicator
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${percent}%` }}
      />
    </ProgressPrimitive.Root>
  );
}
