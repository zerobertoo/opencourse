import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CourseCover } from '@/components/CourseCover';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { useBrandLayout } from '@/lib/brandLayout';
import { localizeCourse, toLocale } from '@/lib/content';
import { cn } from '@/lib/utils';
import { useFormatters } from '@/lib/intl';
import type { EnrolledCourse } from '@/services';
import { routes } from '@/lib/routes';

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
  const cinema = useBrandLayout() === 'cinema';
  const { course, progress, grant } = enrolled;
  const { title } = localizeCourse(course, toLocale(i18n.resolvedLanguage));

  const status = progress.isComplete
    ? ('completed' as const)
    : progress.completedCount === 0
      ? ('notStarted' as const)
      : ('inProgress' as const);

  return (
    <Card
      className={cn(
        'group relative flex w-full flex-col overflow-hidden focus-within:ring-2 focus-within:ring-ring hover:shadow-md',
        cinema
          ? 'transition-transform duration-200 hover:scale-[1.03] motion-reduce:transition-none motion-reduce:hover:scale-100'
          : 'transition-shadow',
      )}
    >
      <CourseCover
        imageUrl={course.coverImageUrl}
        seed={course.id}
        className={cn('w-full', cinema ? 'aspect-[2/3]' : 'aspect-video')}
      />
      <div className={cn('flex flex-1 flex-col gap-3', cinema ? 'p-3' : 'p-4')}>
        <div
          className={cn(
            'flex gap-2',
            cinema ? 'flex-col items-start' : 'items-start justify-between',
          )}
        >
          <h3 className={cn('font-semibold leading-snug', cinema ? 'text-base' : 'text-lg')}>
            {/* the whole card is clickable through the stretched link */}
            <Link
              to={routes.course(course.slug)}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {title}
            </Link>
          </h3>
          <Badge
            variant={status === 'completed' ? 'success' : 'neutral'}
            className={cinema ? undefined : 'shrink-0'}
          >
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
