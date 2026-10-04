import { cn } from '@/lib/utils';

/** Base surface for content blocks. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border bg-surface text-surface-foreground', className)}
      {...props}
    />
  );
}
