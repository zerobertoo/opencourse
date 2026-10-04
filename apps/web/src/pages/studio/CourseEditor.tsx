import { getIncompleteLocales } from '@opencourse/shared';
import { AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CertificateTab } from '@/features/studio/CertificateTab';
import { ContentTab } from '@/features/studio/content/ContentTab';
import { CourseStatusBadge } from '@/features/studio/CourseStatusBadge';
import { DetailsTab } from '@/features/studio/DetailsTab';
import { SettingsTab } from '@/features/studio/SettingsTab';
import { StudentsTab } from '@/features/studio/StudentsTab';
import { useCourseById, useEnabledLocales } from '@/hooks/studioQueries';
import { localizeCourse, toLocale } from '@/lib/content';
import { isServiceError } from '@/services';
import { Forbidden } from '../Forbidden';

const EDITOR_TABS = ['details', 'content', 'students', 'certificate', 'settings'] as const;
type EditorTab = (typeof EDITOR_TABS)[number];

function isEditorTab(value: string | undefined): value is EditorTab {
  return EDITOR_TABS.some((tab) => tab === value);
}

function EditorSkeleton() {
  const { t } = useTranslation('common');
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">{t('states.loading')}</span>
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Tabbed course editor of the Studio. */
export function CourseEditor() {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const { courseId = '', tab } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = useCourseById(courseId);
  const enabledLocales = useEnabledLocales(query.data);

  if (query.isPending) return <EditorSkeleton />;
  if (query.isError) {
    if (isServiceError(query.error) && query.error.code === 'not_found') {
      return (
        <EmptyState
          title={t('studio:editor.notFoundTitle')}
          description={t('studio:editor.notFoundDescription')}
        >
          <Button asChild variant="outline">
            <Link to="/studio/courses">{t('studio:editor.backToCourses')}</Link>
          </Button>
        </EmptyState>
      );
    }
    return <ErrorState onRetry={() => void query.refetch()} />;
  }

  const course = query.data;
  // instructors only edit their own courses; admins edit any
  if (user?.role === 'instructor' && course.instructorId !== user.id) return <Forbidden />;
  if (!isEditorTab(tab)) {
    return <Navigate to={`/studio/courses/${course.id}/details`} replace />;
  }

  const title = localizeCourse(course, toLocale(i18n.resolvedLanguage)).title;
  const hasIncompleteTranslation = getIncompleteLocales(course, enabledLocales).length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link to="/studio/courses">
            <ArrowLeft aria-hidden="true" />
            {t('studio:editor.backToCourses')}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <h1 className="font-serif text-2xl font-semibold sm:text-3xl">
              {title || t('studio:content.untitled')}
            </h1>
            <CourseStatusBadge status={course.status} />
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/courses/${course.slug}`}>
              <ExternalLink aria-hidden="true" />
              {t('studio:editor.viewAsStudent')}
            </Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(next) => navigate(`/studio/courses/${course.id}/${next}`)}>
        <TabsList aria-label={t('studio:editor.tabsLabel')}>
          {EDITOR_TABS.map((value) => (
            <TabsTrigger key={value} value={value} className="inline-flex items-center gap-1.5">
              {t(`studio:editor.tabs.${value}`)}
              {value === 'details' && hasIncompleteTranslation ? (
                <>
                  <AlertTriangle className="size-3.5 text-destructive" aria-hidden="true" />
                  <span className="sr-only">{t('studio:translation.incompleteMarker')}</span>
                </>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* editors keep their unsaved state while another tab is open */}
        <TabsContent value="details" forceMount className="data-[state=inactive]:hidden">
          <DetailsTab course={course} />
        </TabsContent>
        <TabsContent value="content" forceMount className="data-[state=inactive]:hidden">
          <ContentTab course={course} />
        </TabsContent>
        <TabsContent value="students">
          <StudentsTab course={course} />
        </TabsContent>
        <TabsContent value="certificate">
          <CertificateTab course={course} />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsTab course={course} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
