import { zodResolver } from '@hookform/resolvers/zod';
import { SUPPORTED_LOCALES, type CourseDetail, type Lesson, type Locale } from '@opencourse/shared';
import { ArrowDown, ArrowLeft, ArrowUp, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormError, SelectField, TextAreaField } from '@/components/FormFields';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { Markdown } from '@/components/Markdown';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurriculumMutations } from '@/hooks/studioQueries';
import { localizeLesson, localizeModuleTitle, toLocale } from '@/lib/content';
import {
  moveLessonToModule,
  moveLessonWithinModule,
  toLayout,
  findLessonModuleId,
} from '@/lib/curriculumLayout';
import { formatClock, parseClock } from '@/lib/duration';
import { lessonContentSchema, type LessonContentValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { LocaleTabs } from '../LocaleTabs';
import { MaterialsSection, VideoSection } from './LessonMedia';
import { QuizBuilder } from './QuizBuilder';

function toFormValues(lesson: Lesson, defaultLocale: Locale): LessonContentValues {
  return {
    defaultLocale,
    duration: formatClock(lesson.durationSeconds),
    translations: Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => {
        const saved = lesson.translations.find((item) => item.locale === locale);
        return [locale, { title: saved?.title ?? '', content: saved?.content ?? '' }];
      }),
    ) as LessonContentValues['translations'],
  };
}

/** Wraps a Markdown textarea with a write/preview switch. */
function MarkdownEditor({ value, children }: { value: string; children: React.ReactNode }) {
  const { t } = useTranslation('studio');
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  return (
    <Tabs value={mode} onValueChange={(next) => setMode(next as 'write' | 'preview')}>
      <TabsList aria-label={t('lesson.editorModeLabel')}>
        <TabsTrigger value="write">{t('lesson.write')}</TabsTrigger>
        <TabsTrigger value="preview">{t('lesson.preview')}</TabsTrigger>
      </TabsList>
      {/* stays mounted so the textarea keeps its value while previewing */}
      <TabsContent value="write" forceMount className="data-[state=inactive]:hidden">
        {children}
      </TabsContent>
      <TabsContent value="preview" className="mt-5 rounded-lg border bg-background p-4">
        {value.trim() === '' ? (
          <p className="text-sm text-muted-foreground">{t('lesson.previewEmpty')}</p>
        ) : (
          <Markdown>{value}</Markdown>
        )}
      </TabsContent>
    </Tabs>
  );
}

interface LessonPanelProps {
  course: CourseDetail;
  lesson: Lesson;
  locales: Locale[];
  /** Back to the curriculum (small screens, where the panel replaces the tree). */
  onBack: () => void;
  onDeleted: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

/** Editing panel of one lesson: content per language, type-specific tools, materials. */
export function LessonPanel({
  course,
  lesson,
  locales,
  onBack,
  onDeleted,
  onDirtyChange,
}: LessonPanelProps) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const mutations = useCurriculumMutations(course.id);
  const describeError = useServiceErrorMessage();
  const [activeLocale, setActiveLocale] = useState<Locale>(course.defaultLocale);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [quizDirty, setQuizDirty] = useState(false);
  const uiLocale = toLocale(i18n.resolvedLanguage);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<LessonContentValues>({
    resolver: zodResolver(lessonContentSchema),
    defaultValues: toFormValues(lesson, course.defaultLocale),
  });

  const watchedContent = useWatch({ control, name: 'translations' });
  useEffect(
    () => onDirtyChange(isDirty || quizDirty),
    [isDirty, quizDirty, onDirtyChange],
  );

  const layout = useMemo(() => toLayout(course), [course]);
  const moduleId = findLessonModuleId(layout, lesson.id);
  const lessonsInModule = layout.find((item) => item.moduleId === moduleId)?.lessonIds ?? [];
  const position = lessonsInModule.indexOf(lesson.id);

  const incomplete = new Set(
    locales.filter(
      (locale) =>
        !lesson.translations.some((item) => item.locale === locale && item.title.trim() !== ''),
    ),
  );
  const title = localizeLesson(lesson, uiLocale, course.defaultLocale).title;

  const reorder = async (next: typeof layout) => {
    try {
      await mutations.reorder.mutateAsync(next);
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const durationSeconds = parseClock(values.duration) ?? lesson.durationSeconds;
        await mutations.updateLesson.mutateAsync({
          lessonId: lesson.id,
          input: {
            durationSeconds,
            translations: SUPPORTED_LOCALES.filter(
              (locale) =>
                locales.includes(locale) &&
                (lesson.translations.some((item) => item.locale === locale) ||
                  values.translations[locale].title.trim() !== '' ||
                  values.translations[locale].content.trim() !== ''),
            ).map((locale) => ({
              locale,
              title: values.translations[locale].title.trim(),
              content: values.translations[locale].content,
            })),
          },
        });
        reset({ ...values, duration: formatClock(durationSeconds) });
        toast.success(t('studio:lesson.savedToast'));
      } catch (error) {
        setFormError(describeError(error));
      }
    },
    (invalid) => {
      const firstWithError = locales.find((locale) => invalid.translations?.[locale]);
      if (firstWithError) setActiveLocale(firstWithError);
    },
  );

  const confirmDelete = async () => {
    try {
      await mutations.deleteLesson.mutateAsync(lesson.id);
      toast.success(t('studio:lesson.deletedToast'));
      onDeleted();
    } catch (error) {
      toast.error(describeError(error));
    }
  };

  const contentLabel =
    lesson.type === 'text' ? t('studio:lesson.bodyField') : t('studio:lesson.descriptionField');

  return (
    <Card className="space-y-6 p-4 sm:p-5">
      <header className="space-y-3">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {t('studio:lesson.backToCurriculum')}
        </Button>
        <div className="flex items-start gap-3">
          <LessonTypeIcon type={lesson.type} className="mt-1.5 size-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-serif text-xl font-semibold">
              {title || t('studio:content.untitled')}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(`common:lessonTypes.${lesson.type}`)}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <SelectField
            label={t('studio:lesson.module')}
            value={moduleId ?? ''}
            disabled={mutations.reorder.isPending}
            onChange={(event) =>
              void reorder(moveLessonToModule(layout, lesson.id, event.target.value))
            }
          >
            {course.modules.map((courseModule) => (
              <option key={courseModule.id} value={courseModule.id}>
                {localizeModuleTitle(courseModule, uiLocale, course.defaultLocale) ||
                  t('studio:content.untitled')}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={position <= 0 || mutations.reorder.isPending}
              onClick={() => void reorder(moveLessonWithinModule(layout, lesson.id, -1))}
            >
              <ArrowUp aria-hidden="true" />
              {t('studio:content.moveUp')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={
                position < 0 ||
                position >= lessonsInModule.length - 1 ||
                mutations.reorder.isPending
              }
              onClick={() => void reorder(moveLessonWithinModule(layout, lesson.id, 1))}
            >
              <ArrowDown aria-hidden="true" />
              {t('studio:content.moveDown')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
              <Trash2 aria-hidden="true" />
              {t('studio:lesson.delete')}
            </Button>
          </div>
        </div>
      </header>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <LocaleTabs
          locales={locales}
          value={activeLocale}
          onValueChange={setActiveLocale}
          incomplete={incomplete}
          label={t('studio:lesson.languagesLabel')}
        >
          {(locale) => (
            <div className="space-y-4">
              <TextField
                label={t('studio:lesson.titleField')}
                error={errors.translations?.[locale]?.title}
                {...register(`translations.${locale}.title`)}
              />
              {lesson.type === 'text' ? (
                <MarkdownEditor value={watchedContent[locale]?.content ?? ''}>
                  <TextAreaField
                    label={contentLabel}
                    hint={t('studio:lesson.markdownHint')}
                    className="min-h-64 font-mono"
                    {...register(`translations.${locale}.content`)}
                  />
                </MarkdownEditor>
              ) : (
                <TextAreaField
                  label={contentLabel}
                  hint={t('studio:lesson.descriptionHint')}
                  {...register(`translations.${locale}.content`)}
                />
              )}
            </div>
          )}
        </LocaleTabs>
        <div className="max-w-xs">
          <TextField
            label={t('studio:lesson.duration')}
            hint={t('studio:lesson.durationHint')}
            inputMode="numeric"
            className="font-mono"
            error={errors.duration}
            {...register('duration')}
          />
        </div>
        <Button type="submit" disabled={!isDirty || mutations.updateLesson.isPending}>
          {mutations.updateLesson.isPending ? <Spinner /> : null}
          {t('studio:lesson.save')}
        </Button>
      </form>

      {lesson.type === 'video' ? (
        <VideoSection courseId={course.id} lesson={lesson} locales={locales} />
      ) : null}
      {lesson.type === 'quiz' ? (
        <QuizBuilder
          courseId={course.id}
          course={course}
          lesson={lesson}
          locales={locales}
          onDirtyChange={setQuizDirty}
        />
      ) : null}
      <MaterialsSection courseId={course.id} lesson={lesson} />

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={t('studio:lesson.deleteTitle')}
        description={t('studio:lesson.deleteDescription', {
          title: title || t('studio:content.untitled'),
        })}
        confirmLabel={t('studio:lesson.delete')}
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  );
}
