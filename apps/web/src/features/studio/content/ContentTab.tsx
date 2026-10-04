import { flattenLessons, type CourseDetail, type Locale } from '@opencourse/shared';
import { MousePointerClick } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/StateViews';
import { Card } from '@/components/ui/card';
import { useCurriculumMutations, useEnabledLocales } from '@/hooks/studioQueries';
import { localizeModuleTitle, toLocale } from '@/lib/content';
import { moveModule, toLayout, type CurriculumLayout } from '@/lib/curriculumLayout';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { cn } from '@/lib/utils';
import { CurriculumTree } from './CurriculumTree';
import { LessonPanel } from './LessonPanel';
import { NewLessonDialog, NewModuleDialog, RenameModuleDialog } from './StructureDialogs';

/** Content tab: sortable curriculum on one side, the selected lesson's editor on the other. */
export function ContentTab({ course }: { course: CourseDetail }) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const locales = useEnabledLocales(course);
  const mutations = useCurriculumMutations(course.id);
  const describeError = useServiceErrorMessage();
  const [params] = useSearchParams();
  // kept in state, not in the URL: this tab stays mounted while another tab is open
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(params.get('lesson'));
  const [pendingSelection, setPendingSelection] = useState<{ lessonId: string | null } | null>(
    null,
  );
  const [addingModule, setAddingModule] = useState(false);
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);
  const hasUnsavedChangesRef = useRef(false);
  const uiLocale = toLocale(i18n.resolvedLanguage);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    hasUnsavedChangesRef.current = dirty;
  }, []);

  const selectedLesson = flattenLessons(course).find((lesson) => lesson.id === selectedLessonId);

  /** Changes the open lesson, asking first when the current one has unsaved edits. */
  const requestSelection = (lessonId: string | null) => {
    if (lessonId === selectedLessonId) return;
    if (hasUnsavedChangesRef.current) setPendingSelection({ lessonId });
    else setSelectedLessonId(lessonId);
  };

  const reorder = async (layout: CurriculumLayout) => {
    try {
      await mutations.reorder.mutateAsync(layout);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const moduleTitle = (moduleId: string | null) => {
    const found = course.modules.find((item) => item.id === moduleId);
    return found
      ? localizeModuleTitle(found, uiLocale, course.defaultLocale) || t('studio:content.untitled')
      : '';
  };

  const deleteModule = async () => {
    const moduleId = deletingModuleId;
    if (!moduleId) return;
    const containsSelected = course.modules
      .find((item) => item.id === moduleId)
      ?.lessons.some((lesson) => lesson.id === selectedLessonId);
    try {
      await mutations.deleteModule.mutateAsync(moduleId);
      if (containsSelected) setSelectedLessonId(null);
      toast.success(t('studio:content.moduleDeletedToast'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  if (course.modules.length === 0) {
    return (
      <>
        <EmptyState
          title={t('studio:content.emptyTitle')}
          description={t('studio:content.emptyDescription')}
          action={{ label: t('studio:content.addModule'), onClick: () => setAddingModule(true) }}
        />
        <NewModuleDialog
          open={addingModule}
          onOpenChange={setAddingModule}
          defaultLocale={course.defaultLocale}
          onSubmit={async (title) => {
            await mutations.createModule.mutateAsync({ title, locale: course.defaultLocale });
            toast.success(t('studio:content.moduleCreatedToast'));
          }}
        />
      </>
    );
  }

  const renamingModule = course.modules.find((item) => item.id === renamingModuleId) ?? null;
  const deletingModule = course.modules.find((item) => item.id === deletingModuleId) ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
      <div className={cn(selectedLesson && 'hidden lg:block')}>
        <CurriculumTree
          course={course}
          enabledLocales={locales}
          selectedLessonId={selectedLesson?.id ?? null}
          onSelectLesson={requestSelection}
          onReorder={reorder}
          onAddModule={() => setAddingModule(true)}
          onAddLesson={setAddingLessonTo}
          onRenameModule={setRenamingModuleId}
          onDeleteModule={setDeletingModuleId}
          onMoveModule={(moduleId, direction) =>
            void reorder(moveModule(toLayout(course), moduleId, direction))
          }
        />
      </div>

      <div className={cn(!selectedLesson && 'hidden lg:block')}>
        {selectedLesson ? (
          <LessonPanel
            // a fresh form per lesson
            key={selectedLesson.id}
            course={course}
            lesson={selectedLesson}
            locales={locales}
            onBack={() => requestSelection(null)}
            onDeleted={() => setSelectedLessonId(null)}
            onDirtyChange={handleDirtyChange}
          />
        ) : (
          <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <MousePointerClick className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">{t('studio:content.selectTitle')}</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('studio:content.selectDescription')}
            </p>
          </Card>
        )}
      </div>

      <NewModuleDialog
        open={addingModule}
        onOpenChange={setAddingModule}
        defaultLocale={course.defaultLocale}
        onSubmit={async (title) => {
          await mutations.createModule.mutateAsync({ title, locale: course.defaultLocale });
          toast.success(t('studio:content.moduleCreatedToast'));
        }}
      />
      <NewLessonDialog
        open={addingLessonTo !== null}
        onOpenChange={(open) => !open && setAddingLessonTo(null)}
        defaultLocale={course.defaultLocale}
        onSubmit={async ({ type, title }) => {
          if (!addingLessonTo) return;
          const { lessonId } = await mutations.createLesson.mutateAsync({
            moduleId: addingLessonTo,
            type,
            title,
            locale: course.defaultLocale,
          });
          toast.success(t('studio:content.lessonCreatedToast'));
          requestSelection(lessonId);
        }}
      />
      <RenameModuleDialog
        courseModule={renamingModule}
        course={course}
        locales={locales}
        onOpenChange={(open) => !open && setRenamingModuleId(null)}
        onSubmit={async (moduleId, titles: Array<{ locale: Locale; title: string }>) => {
          await mutations.updateModule.mutateAsync({ moduleId, input: { translations: titles } });
          toast.success(t('studio:content.moduleRenamedToast'));
        }}
      />
      <ConfirmDialog
        open={deletingModule !== null}
        onOpenChange={(open) => !open && setDeletingModuleId(null)}
        title={t('studio:content.deleteModuleDialog.title')}
        description={t('studio:content.deleteModuleDialog.description', {
          title: moduleTitle(deletingModuleId),
          count: deletingModule?.lessons.length ?? 0,
        })}
        confirmLabel={t('studio:content.deleteModule')}
        onConfirm={() => void deleteModule()}
      />
      <ConfirmDialog
        open={pendingSelection !== null}
        onOpenChange={(open) => !open && setPendingSelection(null)}
        title={t('studio:content.unsavedDialog.title')}
        description={t('studio:content.unsavedDialog.description')}
        confirmLabel={t('studio:content.unsavedDialog.confirm')}
        onConfirm={() => {
          if (pendingSelection) {
            hasUnsavedChangesRef.current = false;
            setSelectedLessonId(pendingSelection.lessonId);
          }
          setPendingSelection(null);
        }}
      />
    </div>
  );
}
