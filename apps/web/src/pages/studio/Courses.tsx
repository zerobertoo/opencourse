import { courseStatusSchema } from '@opencourse/shared';
import type { CourseStatus, ListedCourse, Locale } from '@opencourse/shared';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { CourseCover } from '@/components/CourseCover';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CourseStatusBadge } from '@/features/studio/CourseStatusBadge';
import { NewCourseDialog } from '@/features/studio/NewCourseDialog';
import { useEnabledLocales, useStudioCourses, useStudioDashboard } from '@/hooks/studioQueries';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';

function StudioCourseCard({
  course,
  students,
  enabledLocales,
  timeZone,
}: {
  course: ListedCourse;
  students: number | undefined;
  enabledLocales: Locale[];
  timeZone?: string;
}) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const { formatDate } = useFormatters(timeZone);
  const title = localizeCourse(course, toLocale(i18n.resolvedLanguage)).title;
  const incomplete = enabledLocales.filter((locale) => !course.completeLocales.includes(locale));

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
              to={`/studio/courses/${course.id}`}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {title}
            </Link>
          </h3>
          <CourseStatusBadge status={course.status} />
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {t('studio:courses.structure', {
            modules: course.moduleCount,
            lessons: course.lessonCount,
          })}
          {students !== undefined ? ` · ${t('studio:courses.students', { count: students })}` : ''}
        </p>
        {incomplete.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t('studio:courses.incompleteLabel')}>
            {incomplete.map((locale) => (
              <li key={locale}>
                <Badge variant="warning">
                  {t('studio:courses.incompleteIn', { language: t(`common:language.${locale}`) })}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-auto text-xs text-muted-foreground">
          {t('studio:courses.updatedOn', { date: formatDate(new Date(course.updatedAt)) })}
        </p>
      </div>
    </Card>
  );
}

/** Course list of the Studio: search, status filter and new course. */
export function StudioCourses() {
  const { t } = useTranslation(['studio', 'common']);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const search = params.get('q') ?? '';
  const parsedStatus = courseStatusSchema.safeParse(params.get('status'));
  const status: CourseStatus | undefined = parsedStatus.success ? parsedStatus.data : undefined;

  // the managed scope already limits instructors to their own courses
  const query = useStudioCourses({ scope: 'managed', search, status });
  const stats = useStudioDashboard();
  const enabledLocales = useEnabledLocales();
  const hasFilters = search.trim() !== '' || status !== undefined;

  const updateParam = (key: 'q' | 'status', value: string) => {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = hasFilters ? (
      <EmptyState
        title={t('studio:courses.noResultsTitle')}
        description={t('studio:courses.noResultsDescription')}
        action={{ label: t('studio:courses.clearFilters'), onClick: () => setParams({}) }}
      />
    ) : (
      <EmptyState
        title={t('studio:courses.emptyTitle')}
        description={t('studio:courses.emptyDescription')}
        action={{ label: t('studio:courses.new'), onClick: () => setCreating(true) }}
      />
    );
  } else {
    const studentsByCourse = new Map(
      stats.data?.courses.map((entry) => [entry.courseId, entry.students]),
    );
    body = (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {query.data.map((course) => (
          <li key={course.id} className="flex min-w-0">
            <StudioCourseCard
              course={course}
              students={studentsByCourse.get(course.id)}
              enabledLocales={enabledLocales}
              timeZone={user?.timeZone}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t('studio:courses.title')}</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('studio:courses.new')}
        </Button>
      </div>

      <div role="search" className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <label htmlFor="studio-search" className="sr-only">
            {t('studio:courses.searchLabel')}
          </label>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="studio-search"
            type="search"
            className="ps-9"
            placeholder={t('studio:courses.searchPlaceholder')}
            value={search}
            onChange={(event) => updateParam('q', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="studio-status" className="sr-only">
            {t('studio:courses.statusLabel')}
          </label>
          <Select
            id="studio-status"
            value={status ?? ''}
            onChange={(event) => updateParam('status', event.target.value)}
          >
            <option value="">{t('studio:courses.allStatuses')}</option>
            {courseStatusSchema.options.map((option) => (
              <option key={option} value={option}>
                {t(`common:courseStatus.${option}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {body}
      <NewCourseDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
