import { BookCheck, Plus, TrendingUp, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CourseStatusBadge } from '@/features/studio/CourseStatusBadge';
import { NewCourseDialog } from '@/features/studio/NewCourseDialog';
import { useStudioCourses, useStudioDashboard } from '@/hooks/studioQueries';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import type { CourseStats } from '@/services';

/** How many courses the dashboard lists before pointing to the full list. */
const DASHBOARD_COURSE_LIMIT = 5;

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <div className="rounded-lg bg-accent p-2.5 text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <dl className="min-w-0 space-y-1">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd className="font-mono text-3xl font-semibold">{value}</dd>
        {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
      </dl>
    </Card>
  );
}

function MetricsSection({ timeZone }: { timeZone?: string }) {
  const { t } = useTranslation(['studio', 'common']);
  const { formatNumber, formatPercent } = useFormatters(timeZone);
  const query = useStudioDashboard();

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="grid gap-4 sm:grid-cols-3">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;

  const { activeStudents, publishedCourses, completionRate } = query.data;
  return (
    <section aria-label={t('studio:dashboard.metricsLabel')} className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        icon={Users}
        label={t('studio:dashboard.activeStudents')}
        value={formatNumber(activeStudents)}
        hint={t('studio:dashboard.activeStudentsHint')}
      />
      <MetricCard
        icon={BookCheck}
        label={t('studio:dashboard.publishedCourses')}
        value={formatNumber(publishedCourses)}
      />
      <MetricCard
        icon={TrendingUp}
        label={t('studio:dashboard.completionRate')}
        value={formatPercent(completionRate)}
        hint={t('studio:dashboard.completionRateHint')}
      />
    </section>
  );
}

function CoursesSection({ onCreate }: { onCreate: () => void }) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const { user } = useAuth();
  const { formatPercent } = useFormatters(user?.timeZone);
  const locale = toLocale(i18n.resolvedLanguage);
  const courses = useStudioCourses({
    instructorId: user?.role === 'instructor' ? user.id : undefined,
  });
  const stats = useStudioDashboard();

  if (courses.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (courses.isError) return <ErrorState onRetry={() => void courses.refetch()} />;
  if (courses.data.length === 0) {
    return (
      <EmptyState
        title={t('studio:dashboard.emptyTitle')}
        description={t('studio:dashboard.emptyDescription')}
        action={{ label: t('studio:courses.new'), onClick: onCreate }}
      />
    );
  }

  const statsByCourse = new Map<string, CourseStats>(
    stats.data?.courses.map((entry) => [entry.courseId, entry]),
  );
  const recent = [...courses.data]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, DASHBOARD_COURSE_LIMIT);

  return (
    <ul className="divide-y rounded-xl border bg-surface">
      {recent.map((course) => {
        const entry = statsByCourse.get(course.id);
        const title = localizeCourse(course, locale).title;
        return (
          <li key={course.id}>
            <Link
              to={`/studio/courses/${course.id}`}
              className="flex flex-col gap-2 p-4 hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="truncate font-medium">{title}</span>
                <CourseStatusBadge status={course.status} />
              </span>
              {entry ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {t('studio:dashboard.courseStats', {
                    students: entry.students,
                    rate: formatPercent(entry.completionRate),
                  })}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Studio home: metric cards and the instructor's most recent courses. */
export function StudioDashboard() {
  const { t } = useTranslation(['studio', 'common']);
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-semibold sm:text-3xl">
            {t('studio:dashboard.title')}
          </h1>
          <p className="text-muted-foreground">{t('studio:dashboard.subtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('studio:courses.new')}
        </Button>
      </div>

      <MetricsSection timeZone={user?.timeZone} />

      <section aria-labelledby="studio-courses-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="studio-courses-heading" className="font-serif text-xl font-semibold">
            {t('studio:dashboard.coursesTitle')}
          </h2>
          <Link
            to="/studio/courses"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('studio:dashboard.viewAll')}
          </Link>
        </div>
        <CoursesSection onCreate={() => setCreating(true)} />
      </section>

      <NewCourseDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
