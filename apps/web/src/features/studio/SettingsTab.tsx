import { getPublishIssues, type CourseDetail, type CourseStatus } from '@opencourse/shared';
import { Archive, CheckCircle2, CircleAlert, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CheckboxField } from '@/components/FormFields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUpdateCourse } from '@/hooks/studioQueries';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { CourseStatusBadge } from './CourseStatusBadge';

type PendingChange = { status: CourseStatus; kind: 'unpublish' | 'archive' } | null;

/** Settings tab: visibility (publish / back to draft), lesson order and archiving. */
export function SettingsTab({ course }: { course: CourseDetail }) {
  const { t } = useTranslation(['studio', 'common']);
  const updateCourse = useUpdateCourse(course.id);
  const describeError = useServiceErrorMessage();
  const [pending, setPending] = useState<PendingChange>(null);
  const issues = getPublishIssues(course);
  const isArchived = course.status === 'archived';

  const apply = async (
    input: Parameters<typeof updateCourse.mutateAsync>[0],
    successMessage: string,
  ) => {
    try {
      await updateCourse.mutateAsync(input);
      toast.success(successMessage);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">
            {t('studio:settings.visibility.title')}
          </h2>
          <CourseStatusBadge status={course.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {t(`studio:settings.visibility.description.${course.status}`)}
        </p>

        {course.status === 'draft' ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              {t('studio:settings.visibility.checklistTitle')}
            </h3>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                {t('studio:settings.visibility.ready')}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {issues.map((issue) => (
                  <li key={issue} className="flex items-start gap-2 text-sm">
                    <CircleAlert
                      className="mt-0.5 size-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                    {t(`studio:settings.visibility.issues.${issue}`)}
                  </li>
                ))}
              </ul>
            )}
            <Button
              disabled={issues.length > 0 || updateCourse.isPending}
              onClick={() =>
                void apply({ status: 'published' }, t('studio:settings.visibility.publishedToast'))
              }
            >
              {t('studio:settings.visibility.publish')}
            </Button>
          </div>
        ) : null}

        {course.status === 'published' ? (
          <Button
            variant="outline"
            disabled={updateCourse.isPending}
            onClick={() => setPending({ status: 'draft', kind: 'unpublish' })}
          >
            {t('studio:settings.visibility.unpublish')}
          </Button>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-serif text-xl font-semibold">{t('studio:settings.order.title')}</h2>
        <CheckboxField
          label={t('studio:settings.order.sequential')}
          hint={t('studio:settings.order.sequentialHint')}
          checked={course.sequentialOrder}
          disabled={updateCourse.isPending}
          onChange={(event) =>
            void apply(
              { sequentialOrder: event.target.checked },
              t('studio:settings.order.savedToast'),
            )
          }
        />
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="font-serif text-xl font-semibold">{t('studio:settings.archive.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {isArchived
            ? t('studio:settings.archive.archivedDescription')
            : t('studio:settings.archive.description')}
        </p>
        {isArchived ? (
          <Button
            variant="outline"
            disabled={updateCourse.isPending}
            onClick={() =>
              void apply({ status: 'draft' }, t('studio:settings.archive.restoredToast'))
            }
          >
            <Undo2 aria-hidden="true" />
            {t('studio:settings.archive.restore')}
          </Button>
        ) : (
          <Button
            variant="destructive"
            disabled={updateCourse.isPending}
            onClick={() => setPending({ status: 'archived', kind: 'archive' })}
          >
            <Archive aria-hidden="true" />
            {t('studio:settings.archive.action')}
          </Button>
        )}
      </Card>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={t(`studio:settings.confirm.${pending?.kind ?? 'archive'}.title`)}
        description={t(`studio:settings.confirm.${pending?.kind ?? 'archive'}.description`)}
        confirmLabel={t(`studio:settings.confirm.${pending?.kind ?? 'archive'}.action`)}
        destructive={pending?.kind === 'archive'}
        onConfirm={() => {
          if (!pending) return;
          void apply(
            { status: pending.status },
            t(`studio:settings.confirm.${pending.kind}.toast`),
          );
        }}
      />
    </div>
  );
}
