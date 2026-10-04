import { Award, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { CourseCard } from '@/components/CourseCard';
import { CourseCover } from '@/components/CourseCover';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useContinueLearning, useMyCertificates, useMyCourses } from '@/hooks/queries';
import { formatClock } from '@/lib/duration';
import { localizeCourse, localizeLesson, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';

function ContinueLearningSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { formatPercent } = useFormatters(timeZone);
  const query = useContinueLearning();
  const locale = toLocale(i18n.resolvedLanguage);

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  // with nothing in progress the section disappears; "my courses" carries the empty state
  if (!query.data) return null;

  const { course, lesson, progress, videoPositionSeconds } = query.data;
  const courseContent = localizeCourse(course, locale);
  const lessonContent = localizeLesson(lesson, locale, course.defaultLocale);

  return (
    <section aria-labelledby="continue-heading" className="space-y-3">
      <h2 id="continue-heading" className="text-xl font-semibold">
        {t('home.continueTitle')}
      </h2>
      <Card className="flex flex-col overflow-hidden sm:flex-row">
        <CourseCover
          imageUrl={course.coverImageUrl}
          className="aspect-video w-full sm:aspect-auto sm:w-56"
        />
        <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{courseContent.title}</p>
            <p className="text-xl font-semibold leading-snug">{lessonContent.title}</p>
            {lesson.type === 'video' && videoPositionSeconds > 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                {t('home.resumeAt', { time: formatClock(videoPositionSeconds) })}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <ProgressBar
              value={progress.percent}
              label={t('course.progressLabel', { title: courseContent.title })}
            />
            <p className="font-mono text-xs text-muted-foreground">
              {t('course.lessonsCompleted', {
                completed: progress.completedCount,
                total: progress.totalCount,
              })}{' '}
              · {formatPercent(progress.percent)}
            </p>
          </div>
          <Button asChild className="w-full sm:w-fit">
            <Link to={`/courses/${course.slug}/lessons/${lesson.id}`}>
              <Play aria-hidden="true" />
              {t('home.continueAction')}
            </Link>
          </Button>
        </div>
      </Card>
    </section>
  );
}

function MyCoursesSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation(['student', 'common']);
  const [params, setParams] = useSearchParams();
  const search = params.get('q')?.trim() ?? '';
  const query = useMyCourses();
  const locale = toLocale(i18n.resolvedLanguage);

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
    body = (
      <EmptyState
        title={t('home.emptyTitle')}
        description={t('home.emptyDescription')}
        action={{ label: t('home.emptyAction'), onClick: () => void query.refetch() }}
      />
    );
  } else {
    const needle = search.toLowerCase();
    const visible = needle
      ? query.data.filter(({ course }) =>
          localizeCourse(course, locale).title.toLowerCase().includes(needle),
        )
      : query.data;
    body =
      visible.length === 0 ? (
        <EmptyState
          title={t('home.noResultsTitle')}
          description={t('home.noResultsDescription', { query: search })}
          action={{ label: t('home.clearSearch'), onClick: () => setParams({}) }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((enrolled) => (
            <li key={enrolled.course.id} className="flex min-w-0">
              <CourseCard enrolled={enrolled} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <section aria-labelledby="courses-heading" className="space-y-3">
      <h2 id="courses-heading" className="text-xl font-semibold">
        {t('home.myCoursesTitle')}
      </h2>
      {body}
    </section>
  );
}

function RecentCertificatesSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { formatDate } = useFormatters(timeZone);
  const query = useMyCertificates();
  const locale = toLocale(i18n.resolvedLanguage);

  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-20 w-full" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title={t('home.noCertificatesTitle')}
        description={t('home.noCertificatesDescription')}
      />
    );
  } else {
    body = (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {query.data.slice(0, 3).map((certificate) => (
          <li key={certificate.id} className="min-w-0">
            <Link
              to="/certificates"
              className="flex items-center gap-3 rounded-xl border bg-surface p-4 hover:bg-muted/60"
            >
              <Award className="size-6 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {localizeCourse(certificate.course, locale).title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('certificates.issuedOn', {
                    date: formatDate(new Date(certificate.issuedAt)),
                  })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby="certificates-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="certificates-heading" className="text-xl font-semibold">
          {t('home.recentCertificatesTitle')}
        </h2>
        <Link
          to="/certificates"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('home.viewAll')}
        </Link>
      </div>
      {body}
    </section>
  );
}

/** Student home: continue where you left off, my courses and recent certificates. */
export function Home() {
  const { t } = useTranslation(['student', 'common']);
  const { user } = useAuth();
  if (!user) return null;
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {t('home.greeting', { name: firstName })}
      </h1>
      <ContinueLearningSection timeZone={user.timeZone} />
      <MyCoursesSection timeZone={user.timeZone} />
      <RecentCertificatesSection timeZone={user.timeZone} />
    </div>
  );
}
