import {
  flattenLessons,
  getCourseDurationSeconds,
  getUnlockedLessonIds,
  summarizeCourseProgress,
} from '@opencourse/shared';
import { CircleCheck, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { CourseCover } from '@/components/CourseCover';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { EmptyState, ErrorState } from '@/components/StateViews';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useCourseAccess, useCourseBySlug, useCourseProgress, useUserById } from '@/hooks/queries';
import { useFormatDuration } from '@/hooks/useFormatDuration';
import { localizeCourse, localizeLesson, localizeModuleTitle, toLocale } from '@/lib/content';
import { formatClock } from '@/lib/duration';
import { useFormatters } from '@/lib/intl';
import { isServiceError } from '@/services';

function CoursePageSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">{t('states.loading')}</span>
      <Skeleton className="aspect-[3/1] w-full" />
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Course landing page: description, learning outcomes and the curriculum with lesson status. */
export function CoursePage() {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const { formatPercent } = useFormatters(user?.timeZone);
  const formatDuration = useFormatDuration();
  const locale = toLocale(i18n.resolvedLanguage);

  const courseQuery = useCourseBySlug(slug);
  const course = courseQuery.data;
  const accessQuery = useCourseAccess(course?.id);
  const hasAccess = accessQuery.data === true;
  const progressQuery = useCourseProgress(course?.id, hasAccess);
  // students cannot read other users, so the course carries its instructor's name; the lookup is
  // only for sources that do not (the demo mock)
  const instructorQuery = useUserById(course?.instructor ? undefined : course?.instructorId);

  if (courseQuery.isPending) return <CoursePageSkeleton />;
  if (courseQuery.isError) {
    if (isServiceError(courseQuery.error) && courseQuery.error.code === 'forbidden') {
      return (
        <EmptyState title={t('course.noAccessTitle')} description={t('course.noAccessDescription')}>
          <Button asChild variant="outline">
            <Link to="/">{t('common:actions.goHome')}</Link>
          </Button>
        </EmptyState>
      );
    }
    if (isServiceError(courseQuery.error) && courseQuery.error.code === 'not_found') {
      return (
        <EmptyState title={t('course.notFoundTitle')} description={t('course.notFoundDescription')}>
          <Button asChild variant="outline">
            <Link to="/">{t('common:actions.goHome')}</Link>
          </Button>
        </EmptyState>
      );
    }
    return <ErrorState onRetry={() => void courseQuery.refetch()} />;
  }
  if (accessQuery.isPending || (hasAccess && progressQuery.isPending))
    return <CoursePageSkeleton />;
  if (accessQuery.isError) return <ErrorState onRetry={() => void accessQuery.refetch()} />;
  if (progressQuery.isError) return <ErrorState onRetry={() => void progressQuery.refetch()} />;

  const content = localizeCourse(courseQuery.data, locale);
  const lessons = flattenLessons(courseQuery.data);
  const completedIds = new Set(
    (progressQuery.data ?? []).filter((entry) => entry.completed).map((entry) => entry.lessonId),
  );
  const progress = summarizeCourseProgress(courseQuery.data, completedIds);
  const unlockedIds = hasAccess
    ? getUnlockedLessonIds(courseQuery.data, completedIds)
    : new Set<string>();

  // where the main button leads: the next pending lesson, or the first one when finished
  const targetLessonId = progress.nextLessonId ?? lessons[0]?.id ?? null;
  const ctaKey = progress.isComplete
    ? 'course.review'
    : progress.completedCount > 0
      ? 'course.continue'
      : 'course.start';

  const modules = [...courseQuery.data.modules].sort((a, b) => a.order - b.order);
  const openModuleIds = modules
    .filter((courseModule) => courseModule.lessons.some((lesson) => lesson.id === targetLessonId))
    .map((courseModule) => courseModule.id);

  return (
    <article className="space-y-8">
      <header className="space-y-5">
        <CourseCover
          imageUrl={courseQuery.data.coverImageUrl}
          seed={courseQuery.data.id}
          className="aspect-[3/1] max-h-64 w-full rounded-xl"
        />
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold sm:text-4xl">{content.title}</h1>
          <p className="max-w-3xl text-muted-foreground">{content.description}</p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t('course.instructor')}</dt>
              <dd className="font-medium">
                {courseQuery.data.instructor?.name ??
                  instructorQuery.data?.name ??
                  (instructorQuery.isPending ? '…' : '—')}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t('course.duration')}</dt>
              <dd className="font-mono">
                {formatDuration(getCourseDurationSeconds(courseQuery.data))}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t('course.lessons')}</dt>
              <dd className="font-mono">{lessons.length}</dd>
            </div>
          </dl>
          {content.isFallback ? (
            <p role="note" className="text-sm text-muted-foreground">
              {t('course.fallbackNotice', { language: t(`common:language.${content.locale}`) })}
            </p>
          ) : null}
        </div>

        {hasAccess ? (
          <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex-1 space-y-2">
              <ProgressBar
                value={progress.percent}
                label={t('course.progressLabel', { title: content.title })}
              />
              <p className="font-mono text-xs text-muted-foreground">
                {t('course.lessonsCompleted', {
                  completed: progress.completedCount,
                  total: progress.totalCount,
                })}{' '}
                · {formatPercent(progress.percent)}
              </p>
            </div>
            {targetLessonId ? (
              <Button asChild className="w-full sm:w-auto">
                <Link to={`/courses/${courseQuery.data.slug}/lessons/${targetLessonId}`}>
                  {t(ctaKey)}
                </Link>
              </Button>
            ) : null}
          </Card>
        ) : (
          <Card role="note" className="flex items-start gap-3 p-4 sm:p-5">
            <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">{t('course.noAccessTitle')}</p>
              <p className="text-sm text-muted-foreground">{t('course.noAccessDescription')}</p>
            </div>
          </Card>
        )}
      </header>

      {content.learningOutcomes.length > 0 ? (
        <section aria-labelledby="outcomes-heading" className="space-y-3">
          <h2 id="outcomes-heading" className="text-xl font-semibold">
            {t('course.outcomesTitle')}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {content.learningOutcomes.map((outcome) => (
              <li key={outcome} className="flex items-start gap-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {outcome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="curriculum-heading" className="space-y-3">
        <h2 id="curriculum-heading" className="text-xl font-semibold">
          {t('course.curriculumTitle')}
        </h2>
        {courseQuery.data.sequentialOrder ? (
          <p className="text-sm text-muted-foreground">{t('course.sequentialNotice')}</p>
        ) : null}
        {modules.length === 0 ? (
          <EmptyState
            title={t('course.emptyCurriculumTitle')}
            description={t('course.emptyCurriculumDescription')}
          />
        ) : (
          <Card className="overflow-hidden">
            <Accordion type="multiple" defaultValue={openModuleIds}>
              {modules.map((courseModule) => {
                const moduleLessons = [...courseModule.lessons].sort((a, b) => a.order - b.order);
                const doneCount = moduleLessons.filter((lesson) =>
                  completedIds.has(lesson.id),
                ).length;
                return (
                  <AccordionItem key={courseModule.id} value={courseModule.id}>
                    <AccordionTrigger>
                      <span className="min-w-0">
                        <span className="block">
                          {localizeModuleTitle(
                            courseModule,
                            locale,
                            courseQuery.data.defaultLocale,
                          )}
                        </span>
                        <span className="block font-mono text-xs font-normal text-muted-foreground">
                          {t('course.lessonsCompleted', {
                            completed: doneCount,
                            total: moduleLessons.length,
                          })}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ul className="divide-y">
                        {moduleLessons.map((lesson) => {
                          const lessonContent = localizeLesson(
                            lesson,
                            locale,
                            courseQuery.data.defaultLocale,
                          );
                          const completed = completedIds.has(lesson.id);
                          const locked = !unlockedIds.has(lesson.id);
                          const row = (
                            <>
                              <LessonTypeIcon
                                type={lesson.type}
                                className="size-5 shrink-0 text-muted-foreground"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block">{lessonContent.title}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {t(`common:lessonTypes.${lesson.type}`)}
                                </span>
                              </span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {formatClock(lesson.durationSeconds)}
                              </span>
                              {completed ? (
                                <CircleCheck
                                  className="size-5 shrink-0 text-primary"
                                  aria-label={t('lessonStatus.completed')}
                                />
                              ) : locked ? (
                                <Lock
                                  className="size-4 shrink-0 text-muted-foreground"
                                  aria-label={t('lessonStatus.locked')}
                                />
                              ) : null}
                            </>
                          );
                          return (
                            <li key={lesson.id}>
                              {locked ? (
                                <div className="flex items-center gap-3 px-4 py-3 text-sm opacity-70">
                                  {row}
                                </div>
                              ) : (
                                <Link
                                  to={`/courses/${courseQuery.data.slug}/lessons/${lesson.id}`}
                                  className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60"
                                >
                                  {row}
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </Card>
        )}
      </section>
    </article>
  );
}
