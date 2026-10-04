import {
  flattenLessons,
  getUnlockedLessonIds,
  summarizeCourseProgress,
  type CourseDetail,
  type Lesson,
} from '@opencourse/shared';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Lock,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { Markdown } from '@/components/Markdown';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AttachmentList } from '@/features/player/AttachmentList';
import { CurriculumSidebar } from '@/features/player/CurriculumSidebar';
import { NotesTab } from '@/features/player/NotesTab';
import { QuizLesson } from '@/features/player/QuizLesson';
import { VideoPlayer } from '@/features/player/VideoPlayer';
import {
  useCourseAccess,
  useCourseBySlug,
  useCourseProgress,
  useSaveVideoPosition,
  useSetLessonCompleted,
} from '@/hooks/queries';
import { localizeCourse, localizeLesson, toLocale } from '@/lib/content';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { isServiceError } from '@/services';

function PlayerSkeleton() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <span className="sr-only">{t('states.loading')}</span>
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
      <Skeleton className="hidden h-96 lg:block" />
    </div>
  );
}

/** What the lesson shows as its main content, by lesson type. */
function LessonBody({
  course,
  lesson,
  initialPositionSeconds,
  onVideoPosition,
  onVideoEnded,
  timeZone,
}: {
  course: CourseDetail;
  lesson: Lesson;
  initialPositionSeconds: number;
  onVideoPosition: (seconds: number) => void;
  onVideoEnded: () => void;
  timeZone: string;
}) {
  const { t, i18n } = useTranslation(['player', 'common']);
  const locale = toLocale(i18n.resolvedLanguage);
  const content = localizeLesson(lesson, locale, course.defaultLocale);

  switch (lesson.type) {
    case 'video': {
      const { video } = lesson;
      if (video?.status !== 'ready' || !video.playbackUrl) {
        // no video yet reads as "unavailable", same as a ready video without a source
        const status = video?.status ?? 'ready';
        return (
          <EmptyState
            title={t(`video.status.${status}.title`)}
            description={t(`video.status.${status}.description`)}
          />
        );
      }
      return (
        <VideoPlayer
          key={lesson.id}
          src={video.playbackUrl}
          title={content.title}
          captions={lesson.captions}
          initialPositionSeconds={initialPositionSeconds}
          onPositionChange={onVideoPosition}
          onEnded={onVideoEnded}
        />
      );
    }
    case 'text':
      return <Markdown>{content.content}</Markdown>;
    case 'file':
      return <AttachmentList attachments={lesson.attachments} />;
    case 'quiz':
      return (
        <QuizLesson
          key={lesson.id}
          courseId={course.id}
          lessonId={lesson.id}
          quiz={lesson.quiz}
          locale={locale}
          defaultLocale={course.defaultLocale}
          timeZone={timeZone}
        />
      );
  }
}

/** Lesson player: content by type, previous/complete/next actions, tabs and a collapsible curriculum. */
export function LessonPlayer() {
  const { t, i18n } = useTranslation(['player', 'common']);
  const { slug = '', lessonId = '' } = useParams();
  const { user } = useAuth();
  const describeError = useServiceErrorMessage();
  const locale = toLocale(i18n.resolvedLanguage);
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  const courseQuery = useCourseBySlug(slug);
  const course = courseQuery.data;
  const accessQuery = useCourseAccess(course?.id);
  const hasAccess = accessQuery.data === true;
  const progressQuery = useCourseProgress(course?.id, hasAccess);
  const setCompleted = useSetLessonCompleted(course?.id ?? '');
  const saveVideoPosition = useSaveVideoPosition(course?.id ?? '');

  // every lesson opens at the top of the page
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [lessonId]);

  if (courseQuery.isPending) return <PlayerSkeleton />;
  if (courseQuery.isError) {
    if (isServiceError(courseQuery.error) && courseQuery.error.code === 'not_found') {
      return (
        <EmptyState title={t('lesson.notFoundTitle')} description={t('lesson.notFoundDescription')}>
          <Button asChild variant="outline">
            <Link to="/">{t('common:actions.goHome')}</Link>
          </Button>
        </EmptyState>
      );
    }
    return <ErrorState onRetry={() => void courseQuery.refetch()} />;
  }
  if (accessQuery.isPending || (hasAccess && progressQuery.isPending)) return <PlayerSkeleton />;
  if (accessQuery.isError) return <ErrorState onRetry={() => void accessQuery.refetch()} />;
  if (progressQuery.isError) return <ErrorState onRetry={() => void progressQuery.refetch()} />;

  const courseTitle = localizeCourse(courseQuery.data, locale).title;
  const backToCourse = (
    <Button asChild variant="outline">
      <Link to={`/courses/${courseQuery.data.slug}`}>{t('lesson.backToCourse')}</Link>
    </Button>
  );

  if (!hasAccess) {
    return (
      <EmptyState title={t('lesson.noAccessTitle')} description={t('lesson.noAccessDescription')}>
        {backToCourse}
      </EmptyState>
    );
  }

  const lessons = flattenLessons(courseQuery.data);
  const currentIndex = lessons.findIndex((candidate) => candidate.id === lessonId);
  const lesson = lessons[currentIndex];
  if (!lesson) {
    return (
      <EmptyState title={t('lesson.notFoundTitle')} description={t('lesson.notFoundDescription')}>
        {backToCourse}
      </EmptyState>
    );
  }

  const progressEntries = progressQuery.data ?? [];
  const completedIds = new Set(
    progressEntries.filter((entry) => entry.completed).map((entry) => entry.lessonId),
  );
  const unlockedIds = getUnlockedLessonIds(courseQuery.data, completedIds);
  const summary = summarizeCourseProgress(courseQuery.data, completedIds);

  if (!unlockedIds.has(lesson.id)) {
    const nextPending = summary.nextLessonId;
    return (
      <EmptyState title={t('lesson.lockedTitle')} description={t('lesson.lockedDescription')}>
        {nextPending ? (
          <Button asChild>
            <Link to={`/courses/${courseQuery.data.slug}/lessons/${nextPending}`}>
              {t('lesson.goToPending')}
            </Link>
          </Button>
        ) : (
          backToCourse
        )}
      </EmptyState>
    );
  }

  const content = localizeLesson(lesson, locale, courseQuery.data.defaultLocale);
  const isCompleted = completedIds.has(lesson.id);
  const previous = lessons[currentIndex - 1];
  const next = lessons[currentIndex + 1];
  // with sequential order the next lesson only unlocks after this one is completed
  const nextUnlocked = next ? unlockedIds.has(next.id) || isCompleted : false;
  const savedPosition =
    progressEntries.find((entry) => entry.lessonId === lesson.id)?.videoPositionSeconds ?? 0;
  const timeZone = user?.timeZone ?? 'UTC';
  const lessonUrl = (target: Lesson) => `/courses/${courseQuery.data.slug}/lessons/${target.id}`;

  const toggleCompleted = (completed: boolean) => {
    setCompleted.mutate(
      { lessonId: lesson.id, completed },
      {
        onSuccess: () => {
          if (!completed) return;
          const finishesCourse = summary.completedCount + 1 === summary.totalCount;
          toast.success(
            finishesCourse ? t('lesson.courseFinishedToast') : t('lesson.completedToast'),
          );
        },
        onError: (error) => toast.error(describeError(error)),
      },
    );
  };

  const showDescriptionTab = lesson.type !== 'text';
  const showMaterialsTab = lesson.type !== 'file';
  const defaultTab = showDescriptionTab ? 'description' : showMaterialsTab ? 'materials' : 'notes';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to={`/courses/${courseQuery.data.slug}`}
          className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          <span className="truncate">{courseTitle}</span>
        </Link>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={sidebarOpen}
          aria-controls="player-curriculum"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? (
            <PanelRightClose aria-hidden="true" />
          ) : (
            <PanelRightOpen aria-hidden="true" />
          )}
          {sidebarOpen ? t('curriculum.hide') : t('curriculum.show')}
        </Button>
      </div>

      <div
        className={
          sidebarOpen ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]' : 'grid gap-6'
        }
      >
        <div className="min-w-0 space-y-5">
          <header className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <LessonTypeIcon type={lesson.type} className="size-4" />
              {t(`common:lessonTypes.${lesson.type}`)}
              {isCompleted ? (
                <span className="ms-2 inline-flex items-center gap-1 text-primary">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  {t('lesson.completed')}
                </span>
              ) : null}
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">{content.title}</h1>
            {content.isFallback ? (
              <p role="note" className="text-sm text-muted-foreground">
                {t('lesson.fallbackNotice', { language: t(`common:language.${content.locale}`) })}
              </p>
            ) : null}
          </header>

          <LessonBody
            course={courseQuery.data}
            lesson={lesson}
            initialPositionSeconds={savedPosition}
            timeZone={timeZone}
            onVideoPosition={(seconds) =>
              saveVideoPosition.mutate({ lessonId: lesson.id, positionSeconds: seconds })
            }
            onVideoEnded={() => {
              if (!isCompleted) toggleCompleted(true);
            }}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {previous ? (
              <Button asChild variant="outline" className="sm:order-1">
                <Link to={lessonUrl(previous)}>
                  <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
                  {t('lesson.previous')}
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled className="sm:order-1">
                <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
                {t('lesson.previous')}
              </Button>
            )}
            {lesson.type === 'quiz' && !isCompleted ? (
              <p className="text-center text-sm text-muted-foreground sm:order-2">
                {t('lesson.passQuizToComplete')}
              </p>
            ) : (
              <Button
                variant={isCompleted ? 'secondary' : 'primary'}
                className="sm:order-2"
                aria-pressed={isCompleted}
                disabled={setCompleted.isPending}
                onClick={() => toggleCompleted(!isCompleted)}
              >
                {setCompleted.isPending ? <Spinner /> : <CircleCheck aria-hidden="true" />}
                {isCompleted ? t('lesson.markIncomplete') : t('lesson.markComplete')}
              </Button>
            )}
            {next && nextUnlocked ? (
              <Button asChild variant="outline" className="sm:order-3">
                <Link to={lessonUrl(next)}>
                  {t('lesson.next')}
                  <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled className="sm:order-3">
                {next ? <Lock aria-hidden="true" /> : null}
                {t('lesson.next')}
                <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
              </Button>
            )}
          </div>

          <Tabs key={lesson.id} defaultValue={defaultTab}>
            <TabsList aria-label={t('tabs.label')}>
              {showDescriptionTab ? (
                <TabsTrigger value="description">{t('tabs.description')}</TabsTrigger>
              ) : null}
              {showMaterialsTab ? (
                <TabsTrigger value="materials">{t('tabs.materials')}</TabsTrigger>
              ) : null}
              <TabsTrigger value="notes">{t('tabs.notes')}</TabsTrigger>
            </TabsList>
            {showDescriptionTab ? (
              <TabsContent value="description">
                {content.content.trim() ? (
                  <Markdown>{content.content}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('lesson.noDescription')}</p>
                )}
              </TabsContent>
            ) : null}
            {showMaterialsTab ? (
              <TabsContent value="materials">
                <AttachmentList attachments={lesson.attachments} />
              </TabsContent>
            ) : null}
            <TabsContent value="notes">
              <NotesTab lessonId={lesson.id} timeZone={timeZone} />
            </TabsContent>
          </Tabs>
        </div>

        {sidebarOpen ? (
          <aside
            id="player-curriculum"
            className="rounded-xl border bg-surface p-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto"
          >
            <h2 className="px-2 pb-3 text-lg font-semibold">{t('curriculum.title')}</h2>
            <CurriculumSidebar
              course={courseQuery.data}
              currentLessonId={lesson.id}
              completedIds={completedIds}
              unlockedIds={unlockedIds}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
