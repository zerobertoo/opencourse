import { Award, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { CourseCover } from '@/components/CourseCover';
import { CourseRow } from '@/components/CourseRow';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useContinueLearning, useMyCertificates, useMyCourses } from '@/hooks/queries';
import { formatClock } from '@/lib/duration';
import { localizeCourse, localizeLesson, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';

/** Large banner for the course the student should open next. */
function HeroSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { formatPercent } = useFormatters(timeZone);
  const continueQuery = useContinueLearning();
  const coursesQuery = useMyCourses();
  const locale = toLocale(i18n.resolvedLanguage);

  if (continueQuery.isPending || coursesQuery.isPending) {
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (continueQuery.isError) return <ErrorState onRetry={() => void continueQuery.refetch()} />;

  const resume = continueQuery.data;
  // with nothing in progress, feature the first course that is not finished yet
  const courses = coursesQuery.data ?? [];
  const featured = resume
    ? null
    : (courses.find(({ progress }) => !progress.isComplete) ?? courses[0] ?? null);
  // no courses at all (or they failed to load): the rows below carry the state
  if (!resume && !featured) return null;

  const course = resume ? resume.course : featured!.course;
  const progress = resume ? resume.progress : featured!.progress;
  const courseContent = localizeCourse(course, locale);
  const lessonContent = resume ? localizeLesson(resume.lesson, locale, course.defaultLocale) : null;
  const target = resume
    ? `/courses/${course.slug}/lessons/${resume.lesson.id}`
    : `/courses/${course.slug}`;
  const resumeSeconds = resume?.lesson.type === 'video' ? resume.videoPositionSeconds : 0;

  return (
    <section
      aria-labelledby="hero-heading"
      className="overflow-hidden rounded-xl border bg-surface md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
    >
      <CourseCover
        imageUrl={course.coverImageUrl}
        seed={course.id}
        className="aspect-video w-full md:order-last md:aspect-auto md:min-h-80"
      />
      <div className="flex flex-col justify-center gap-6 p-5 sm:p-8 lg:p-10">
        <div className="space-y-3">
          <h2 id="hero-heading" className="sr-only">
            {resume ? t('home.continueTitle') : t('home.featuredTitle')}
          </h2>
          <p className="text-balance text-3xl font-semibold leading-tight lg:text-4xl">
            {courseContent.title}
          </p>
          {lessonContent ? (
            <p className="text-muted-foreground">{lessonContent.title}</p>
          ) : courseContent.description ? (
            <p className="line-clamp-3 text-muted-foreground">{courseContent.description}</p>
          ) : null}
          {resumeSeconds > 0 ? (
            <p className="font-mono text-xs text-muted-foreground">
              {t('home.resumeAt', { time: formatClock(resumeSeconds) })}
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
          <Link to={target}>
            <Play aria-hidden="true" />
            {resume ? t('home.continueAction') : t('home.startAction')}
          </Link>
        </Button>
      </div>
    </section>
  );
}

/** Course rows by progress state: in progress, not started and completed. */
function CourseRowsSection({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation(['student', 'common']);
  const [params, setParams] = useSearchParams();
  const search = params.get('q')?.trim() ?? '';
  const query = useMyCourses();
  const locale = toLocale(i18n.resolvedLanguage);

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-7 w-40" />
        <div className="flex gap-4 overflow-hidden">
          <Skeleton className="h-64 w-72 shrink-0" />
          <Skeleton className="h-64 w-72 shrink-0" />
          <Skeleton className="h-64 w-72 shrink-0" />
        </div>
      </div>
    );
  }
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) {
    return (
      <EmptyState
        title={t('home.emptyTitle')}
        description={t('home.emptyDescription')}
        action={{ label: t('home.emptyAction'), onClick: () => void query.refetch() }}
      />
    );
  }

  const needle = search.toLowerCase();
  const visible = needle
    ? query.data.filter(({ course }) =>
        localizeCourse(course, locale).title.toLowerCase().includes(needle),
      )
    : query.data;
  if (visible.length === 0) {
    return (
      <EmptyState
        title={t('home.noResultsTitle')}
        description={t('home.noResultsDescription', { query: search })}
        action={{ label: t('home.clearSearch'), onClick: () => setParams({}) }}
      />
    );
  }

  const rows = [
    {
      key: 'inProgress',
      courses: visible.filter(
        ({ progress }) => !progress.isComplete && progress.completedCount > 0,
      ),
    },
    {
      key: 'notStarted',
      courses: visible.filter(
        ({ progress }) => !progress.isComplete && progress.completedCount === 0,
      ),
    },
    { key: 'completed', courses: visible.filter(({ progress }) => progress.isComplete) },
  ].filter((row) => row.courses.length > 0);

  return (
    <div className="space-y-8">
      {rows.map((row) => (
        <CourseRow
          key={row.key}
          title={t(`home.rows.${row.key as 'inProgress' | 'notStarted' | 'completed'}`)}
          courses={row.courses}
          timeZone={timeZone}
        />
      ))}
    </div>
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

/** Student home: hero banner, course rows by progress and recent certificates. */
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
      <HeroSection timeZone={user.timeZone} />
      <CourseRowsSection timeZone={user.timeZone} />
      <RecentCertificatesSection timeZone={user.timeZone} />
    </div>
  );
}
