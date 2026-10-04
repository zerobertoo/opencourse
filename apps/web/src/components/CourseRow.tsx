import { useId } from 'react';
import { CourseCard } from '@/components/CourseCard';
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

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-xl font-semibold">
        {title}
      </h2>
      {/* the next card peeks past the edge to show that the row scrolls */}
      <ul className="scrollbar-themed -mx-4 flex snap-x snap-proximity gap-4 overflow-x-auto scroll-ps-4 px-4 pb-3 sm:mx-0 sm:px-0 sm:scroll-ps-0">
        {courses.map((enrolled) => (
          <li key={enrolled.course.id} className="flex w-[72%] shrink-0 snap-start sm:w-72 lg:w-80">
            <CourseCard enrolled={enrolled} timeZone={timeZone} />
          </li>
        ))}
      </ul>
    </section>
  );
}
