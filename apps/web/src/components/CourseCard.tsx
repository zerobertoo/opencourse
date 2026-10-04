import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CourseCover } from '@/components/CourseCover';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import type { EnrolledCourse } from '@/services';

/** Card of an enrolled course with progress; links to the course page. */
export function CourseCard({
  enrolled,
  timeZone,
}: {
  enrolled: EnrolledCourse;
  timeZone?: string;
}) {
  const { t, i18n } = useTranslation('student');
  const { formatDate, formatPercent } = useFormatters(timeZone);
  const { course, progress, grant } = enrolled;
  const { title } = localizeCourse(course, toLocale(i18n.resolvedLanguage));

  const status = progress.isComplete
    ? ('completed' as const)
    : progress.completedCount === 0
      ? ('notStarted' as const)
      : ('inProgress' as const);

  return (
    <Card className="group relative flex w-full flex-col overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <CourseCover
        imageUrl={course.coverImageUrl}
        seed={course.id}
        className="aspect-video w-full"
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-snug">
            {/* the whole card is clickable through the stretched link */}
            <Link
              to={`/courses/${course.slug}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {title}
            </Link>
          </h3>
          <Badge variant={status === 'completed' ? 'success' : 'neutral'} className="shrink-0">
            {t(`course.status.${status}`)}
          </Badge>
        </div>
        <div className="mt-auto space-y-2">
          <ProgressBar value={progress.percent} label={t('course.progressLabel', { title })} />
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              {t('course.lessonsCompleted', {
                completed: progress.completedCount,
                total: progress.totalCount,
              })}
            </span>
            <span className="font-mono">{formatPercent(progress.percent)}</span>
          </div>
          {grant.expiresAt ? (
            <p className="text-xs text-muted-foreground">
              {t('course.accessUntil', { date: formatDate(new Date(grant.expiresAt)) })}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
