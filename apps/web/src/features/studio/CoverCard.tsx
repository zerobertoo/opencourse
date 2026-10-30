import { COVER_CONTENT_TYPES, COVER_MAX_BYTES, type CourseDetail } from '@opencourse/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CourseCover } from '@/components/CourseCover';
import { FormError } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilePicker } from '@/components/ui/file-picker';
import { useCourseCover } from '@/hooks/studioQueries';
import { useServiceErrorMessage } from '@/lib/serviceError';

const MEGABYTE = 1024 ** 2;

/** Cover image of the course: upload one, replace it, or go back to the generated cover. */
export function CoverCard({ course }: { course: CourseDetail }) {
  const { t } = useTranslation('studio');
  const describeError = useServiceErrorMessage();
  const cover = useCourseCover(course.id);
  const [error, setError] = useState<string | null>(null);
  const isBusy = cover.upload.isPending || cover.remove.isPending;

  async function onPick([file]: File[]) {
    if (!file) return;
    setError(null);
    if (!COVER_CONTENT_TYPES.some((type) => type === file.type)) {
      setError(t('details.cover.invalidType'));
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError(t('details.cover.tooLarge', { max: COVER_MAX_BYTES / MEGABYTE }));
      return;
    }
    try {
      await cover.upload.mutateAsync(file);
      toast.success(t('details.cover.savedToast'));
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await cover.remove.mutateAsync();
      toast.success(t('details.cover.removedToast'));
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  return (
    <Card className="max-w-3xl space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="font-medium">{t('details.cover.title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('details.cover.hint', { max: COVER_MAX_BYTES / MEGABYTE })}
        </p>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-4">
        <CourseCover
          imageUrl={course.coverImageUrl}
          seed={course.id}
          className="aspect-video w-48 rounded-md"
        />
        <div className="flex flex-wrap gap-2">
          <FilePicker
            label={course.coverImageUrl ? t('details.cover.replace') : t('details.cover.upload')}
            accept={COVER_CONTENT_TYPES.join(',')}
            icon={ImagePlus}
            loading={cover.upload.isPending}
            disabled={isBusy}
            onFiles={(files) => void onPick(files)}
          />
          {course.coverImageUrl ? (
            <Button type="button" variant="ghost" disabled={isBusy} onClick={onRemove}>
              {cover.remove.isPending ? <Spinner /> : <Trash2 aria-hidden="true" />}
              {t('details.cover.remove')}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
