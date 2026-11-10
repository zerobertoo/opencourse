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
import { useCourseBanner, useCourseCover } from '@/hooks/studioQueries';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { cn } from '@/lib/utils';

const MEGABYTE = 1024 ** 2;

/** Image of the course: the cover (poster) or the banner (wide, for the home hero). */
export function CoverCard({
  course,
  kind = 'cover',
}: {
  course: CourseDetail;
  kind?: 'cover' | 'banner';
}) {
  const { t } = useTranslation('studio');
  const describeError = useServiceErrorMessage();
  const cover = useCourseCover(course.id);
  const banner = useCourseBanner(course.id);
  const image = kind === 'cover' ? cover : banner;
  const imageUrl = kind === 'cover' ? course.coverImageUrl : course.bannerImageUrl;
  const [error, setError] = useState<string | null>(null);
  const isBusy = image.upload.isPending || image.remove.isPending;

  async function onPick([file]: File[]) {
    if (!file) return;
    setError(null);
    if (!COVER_CONTENT_TYPES.some((type) => type === file.type)) {
      setError(t(`details.${kind}.invalidType`));
      return;
    }
    if (file.size > COVER_MAX_BYTES) {
      setError(t(`details.${kind}.tooLarge`, { max: COVER_MAX_BYTES / MEGABYTE }));
      return;
    }
    try {
      await image.upload.mutateAsync(file);
      toast.success(t(`details.${kind}.savedToast`));
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  async function onRemove() {
    setError(null);
    try {
      await image.remove.mutateAsync();
      toast.success(t(`details.${kind}.removedToast`));
    } catch (failure) {
      setError(describeError(failure));
    }
  }

  return (
    <Card className="max-w-3xl space-y-3 p-4 sm:p-5">
      <div>
        <h2 className="font-medium">{t(`details.${kind}.title`)}</h2>
        <p className="text-sm text-muted-foreground">
          {t(`details.${kind}.hint`, { max: COVER_MAX_BYTES / MEGABYTE })}
        </p>
      </div>
      <FormError message={error} />
      <div className="flex flex-wrap items-center gap-4">
        <CourseCover
          imageUrl={imageUrl}
          seed={course.id}
          className={cn(
            'rounded-md',
            kind === 'cover' ? 'aspect-video w-48' : 'aspect-[21/9] w-72',
          )}
        />
        <div className="flex flex-wrap gap-2">
          <FilePicker
            label={imageUrl ? t(`details.${kind}.replace`) : t(`details.${kind}.upload`)}
            accept={COVER_CONTENT_TYPES.join(',')}
            icon={ImagePlus}
            loading={image.upload.isPending}
            disabled={isBusy}
            onFiles={(files) => void onPick(files)}
          />
          {imageUrl ? (
            <Button type="button" variant="ghost" disabled={isBusy} onClick={onRemove}>
              {image.remove.isPending ? <Spinner /> : <Trash2 aria-hidden="true" />}
              {t(`details.${kind}.remove`)}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
