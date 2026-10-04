import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Course cover image, or a themed placeholder when the course has none. */
export function CourseCover({
  imageUrl,
  className,
}: {
  imageUrl: string | null;
  className?: string;
}) {
  if (imageUrl) {
    // decorative: the course title is always rendered next to the cover
    return <img src={imageUrl} alt={''} className={cn('object-cover', className)} />;
  }
  return (
    <div
      aria-hidden="true"
      className={cn('grid place-items-center bg-accent text-accent-foreground', className)}
    >
      <BookOpen className="size-1/4 min-h-6 min-w-6 opacity-70" />
    </div>
  );
}
