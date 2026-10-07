import { zodResolver } from '@hookform/resolvers/zod';
import {
  findVideoProvider,
  videoProviders,
  type Caption,
  type Lesson,
  type Locale,
} from '@opencourse/shared';
import { FileText, Trash2, Upload, Video } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FormError } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurriculumMutations } from '@/hooks/studioQueries';
import { formatClock } from '@/lib/duration';
import { FileTooLargeError, MOCK_UPLOAD_LIMIT_BYTES, readFileAsDataUrl } from '@/lib/files';
import { formatFileSize } from '@/lib/fileSize';
import { externalVideoSchema, type ExternalVideoValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { isApiMode, type AttachmentUpload } from '@/services';

const URL_PLACEHOLDER = 'https://';

type VideoLesson = Extract<Lesson, { type: 'video' }>;

/** Heading and wrapper shared by the sections of the lesson panel. */
export function PanelSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-5">
      <div className="space-y-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {title}
        </h3>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Button that opens the native file picker for a hidden input. */
function FilePicker({
  label,
  accept,
  multiple,
  disabled,
  onFiles,
}: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []));
          // lets the same file be picked again
          event.target.value = '';
        }}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload aria-hidden="true" />
        {label}
      </Button>
    </>
  );
}

/** Message for a failed file read: too large, or a generic failure. */
function useUploadErrorMessage() {
  const { t } = useTranslation('studio');
  const describeError = useServiceErrorMessage();
  return (error: unknown) =>
    error instanceof FileTooLargeError
      ? t('upload.tooLarge', { limit: formatFileSize(MOCK_UPLOAD_LIMIT_BYTES, 'en') })
      : describeError(error);
}

/** Video status, file upload or provider link, and per-language captions. */
export function VideoSection({
  courseId,
  lesson,
  locales,
}: {
  courseId: string;
  lesson: VideoLesson;
  locales: Locale[];
}) {
  const { t } = useTranslation(['studio', 'common']);
  const { setVideo, removeVideo, updateLesson } = useCurriculumMutations(courseId);
  const describeError = useServiceErrorMessage();
  const describeUploadError = useUploadErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExternalVideoValues>({
    resolver: zodResolver(externalVideoSchema),
    defaultValues: { url: '' },
  });

  const status = lesson.video?.status ?? 'none';
  const isBusy = status === 'processing' || status === 'uploading';
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const isUploading = uploadProgress !== null;
  const providerLabels = videoProviders.map((provider) => provider.label).join(', ');

  const upload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setFormError(null);
    setUploadProgress(0);
    try {
      await setVideo.mutateAsync({
        lessonId: lesson.id,
        source: { provider: 'local', file },
        onProgress: setUploadProgress,
      });
      toast.success(t('studio:video.uploadStarted'));
    } catch (error) {
      setFormError(describeError(error));
    } finally {
      setUploadProgress(null);
    }
  };

  const useLink = handleSubmit(async ({ url }) => {
    setFormError(null);
    try {
      await setVideo.mutateAsync({ lessonId: lesson.id, source: { provider: 'external', url } });
      reset();
      toast.success(t('studio:video.linkSaved'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  const remove = async () => {
    try {
      await removeVideo.mutateAsync(lesson.id);
      toast.success(t('studio:video.removed'));
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const saveCaptions = async (captions: Caption[]) => {
    try {
      await updateLesson.mutateAsync({ lessonId: lesson.id, input: { captions } });
      toast.success(t('studio:video.captionsSaved'));
    } catch (error) {
      toast.error(describeUploadError(error));
    }
  };

  const uploadCaption = async (locale: Locale, files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const url = await readFileAsDataUrl(file);
      await saveCaptions([
        ...lesson.captions.filter((item) => item.locale !== locale),
        { locale, url },
      ]);
    } catch (error) {
      toast.error(describeUploadError(error));
    }
  };

  const video = lesson.video;
  const providerText =
    video?.provider === 'local'
      ? t('studio:video.provider.local')
      : video?.provider === 'external'
        ? t('studio:video.provider.external', {
            plugin: findVideoProvider(video.plugin)?.label ?? video.plugin,
          })
        : null;

  return (
    <>
      <PanelSection title={t('studio:video.title')} description={t('studio:video.description')}>
        <div className="space-y-4">
          <FormError message={formError} />
          <div className="flex flex-wrap items-center gap-2">
            <Video className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm">{t('studio:video.statusLabel')}</span>
            <Badge
              variant={status === 'ready' ? 'success' : status === 'error' ? 'warning' : 'neutral'}
            >
              {isBusy || isUploading ? <Spinner /> : null}
              {isUploading
                ? t('studio:video.uploading', { percent: Math.round(uploadProgress * 100) })
                : t(`studio:video.status.${status}`)}
            </Badge>
            {providerText ? (
              <span className="text-xs text-muted-foreground">{providerText}</span>
            ) : null}
          </div>
          {video?.provider === 'local' && video.status === 'processing' ? (
            <p className="text-xs text-muted-foreground">{t('studio:video.processingNote')}</p>
          ) : null}
          {video?.provider === 'local' && video.status === 'ready' && video.durationSeconds ? (
            <p className="text-xs text-muted-foreground">
              {t('studio:video.readyNote', { duration: formatClock(video.durationSeconds) })}
            </p>
          ) : null}
          {video?.provider === 'local' && video.status === 'error' ? (
            <p role="alert" className="text-sm text-destructive">
              {t('studio:video.errorNote', { message: video.errorMessage ?? '' })}
            </p>
          ) : null}
          {video?.provider === 'external' ? (
            <p className="break-all text-xs text-muted-foreground">{video.embedUrl}</p>
          ) : null}

          <Tabs defaultValue="upload">
            <TabsList aria-label={t('studio:video.tabs.label')}>
              <TabsTrigger value="upload">{t('studio:video.tabs.upload')}</TabsTrigger>
              <TabsTrigger value="link">{t('studio:video.tabs.link')}</TabsTrigger>
            </TabsList>
            <TabsContent value="upload" className="space-y-3">
              <FilePicker
                label={t('studio:video.upload')}
                accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv,.m4v"
                disabled={setVideo.isPending || isUploading}
                onFiles={(files) => void upload(files)}
              />
              <p className="text-xs text-muted-foreground">
                {isApiMode ? t('studio:video.uploadHint') : t('studio:video.demoNote')}
              </p>
            </TabsContent>
            <TabsContent value="link" className="space-y-2">
              <form
                onSubmit={useLink}
                noValidate
                className="flex flex-col gap-2 sm:flex-row sm:items-start"
              >
                <div className="flex-1">
                  <TextField
                    label={t('studio:video.externalUrl')}
                    type="url"
                    inputMode="url"
                    placeholder={URL_PLACEHOLDER}
                    error={errors.url}
                    {...register('url')}
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  className="sm:mt-[1.625rem]"
                  disabled={setVideo.isPending}
                >
                  {t('studio:video.useLink')}
                </Button>
              </form>
              <p className="text-xs text-muted-foreground">
                {t('studio:video.supportedProviders', { providers: providerLabels })}
              </p>
            </TabsContent>
          </Tabs>

          {video ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={removeVideo.isPending || isUploading}
              onClick={() => void remove()}
            >
              <Trash2 aria-hidden="true" />
              {t('studio:video.remove')}
            </Button>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection
        title={t('studio:video.captionsTitle')}
        description={
          isApiMode ? t('studio:video.captionsApiNote') : t('studio:video.captionsDescription')
        }
      >
        <ul className="space-y-2">
          {locales.map((locale) => {
            const caption = lesson.captions.find((item) => item.locale === locale);
            const language = t(`common:language.${locale}`);
            return (
              <li
                key={locale}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <span className="flex items-center gap-2 text-sm">
                  {language}
                  <Badge variant={caption ? 'success' : 'neutral'}>
                    {caption ? t('studio:video.captionAdded') : t('studio:video.captionMissing')}
                  </Badge>
                </span>
                <span className="flex gap-2">
                  {isApiMode ? null : (
                    <FilePicker
                      label={t('studio:video.captionUpload', { language })}
                      accept=".vtt,text/vtt"
                      disabled={updateLesson.isPending}
                      onFiles={(files) => void uploadCaption(locale, files)}
                    />
                  )}
                  {caption ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t('studio:video.captionRemove', { language })}
                      disabled={updateLesson.isPending}
                      onClick={() =>
                        void saveCaptions(lesson.captions.filter((item) => item.locale !== locale))
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </PanelSection>
    </>
  );
}

/** Downloadable materials of a lesson (the content of a file lesson). */
export function MaterialsSection({ courseId, lesson }: { courseId: string; lesson: Lesson }) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const { addAttachments, removeAttachment } = useCurriculumMutations(courseId);
  const describeUploadError = useUploadErrorMessage();
  const isSaving = addAttachments.isPending || removeAttachment.isPending;

  const removeFile = async (attachmentId: string) => {
    try {
      await removeAttachment.mutateAsync({ lessonId: lesson.id, attachmentId });
      toast.success(t('studio:materials.saved'));
    } catch (error) {
      toast.error(describeUploadError(error));
    }
  };

  const addFiles = async (files: File[]) => {
    try {
      const uploads = await Promise.all(
        files.map(async (file): Promise<AttachmentUpload> => ({
          name: file.name,
          sizeBytes: file.size,
          url: await readFileAsDataUrl(file),
        })),
      );
      await addAttachments.mutateAsync({ lessonId: lesson.id, files: uploads });
      toast.success(t('studio:materials.saved'));
    } catch (error) {
      toast.error(describeUploadError(error));
    }
  };
  return (
    <PanelSection
      title={
        lesson.type === 'file' ? t('studio:materials.titleFileLesson') : t('studio:materials.title')
      }
      description={t('studio:materials.description')}
    >
      {lesson.attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('studio:materials.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {lesson.attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-3 rounded-lg border p-3 text-sm"
            >
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {formatFileSize(attachment.sizeBytes, i18n.language)}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('studio:materials.remove', { name: attachment.name })}
                disabled={isSaving}
                onClick={() => void removeFile(attachment.id)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {isApiMode ? (
        <p className="text-xs text-muted-foreground">{t('studio:materials.apiNote')}</p>
      ) : (
        <div className="space-y-1.5">
          <FilePicker
            label={t('studio:materials.add')}
            accept="*/*"
            multiple
            disabled={isSaving}
            onFiles={(files) => void addFiles(files)}
          />
          <p className="text-xs text-muted-foreground">
            {t('studio:materials.limitNote', {
              limit: formatFileSize(MOCK_UPLOAD_LIMIT_BYTES, i18n.language),
            })}
          </p>
        </div>
      )}
    </PanelSection>
  );
}
