import { cn } from '@/lib/utils';

/** Generic loading block. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md motion-reduce:animate-none bg-muted', className)}
      {...props}
    />
  );
}
