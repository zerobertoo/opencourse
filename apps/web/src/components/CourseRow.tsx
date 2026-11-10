import { useId } from 'react';
import { CourseCard } from '@/components/CourseCard';
import { useBrandLayout } from '@/lib/brandLayout';
import { cn } from '@/lib/utils';
import type { EnrolledCourse } from '@/services';

/** Horizontally scrolling row of course cards under a heading. */
export function CourseRow({
  title,
  courses,
  timeZone,
}: {
  title: string;
  courses: EnrolledCourse[];
  timeZone?: string;
}) {
  const headingId = useId();
  const cinema = useBrandLayout() === 'cinema';

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-xl font-semibold">
        {title}
      </h2>
      {/* the next card peeks past the edge to show that the row scrolls */}
      <ul
        className={cn(
          'scrollbar-themed -mx-4 flex snap-x snap-proximity gap-4 overflow-x-auto scroll-ps-4 px-4 sm:mx-0',
          // room for the hover scale, which the scroll container would otherwise clip
          cinema ? 'py-3 sm:-mx-2 sm:px-2 sm:scroll-ps-2' : 'pb-3 sm:px-0 sm:scroll-ps-0',
        )}
      >
        {courses.map((enrolled) => (
          <li
            key={enrolled.course.id}
            className={cn(
              'flex shrink-0 snap-start',
              cinema ? 'w-[44%] sm:w-44 lg:w-52' : 'w-[72%] sm:w-72 lg:w-80',
            )}
          >
            <CourseCard enrolled={enrolled} timeZone={timeZone} />
          </li>
        ))}
      </ul>
    </section>
  );
}
