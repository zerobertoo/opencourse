import { zodResolver } from '@hookform/resolvers/zod';
import {
  SUPPORTED_LOCALES,
  lessonTypeSchema,
  type CourseDetail,
  type CourseModuleWithLessons,
  type Locale,
} from '@opencourse/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormError } from '@/components/FormFields';
import { LessonTypeIcon } from '@/components/LessonTypeIcon';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import {
  moduleTitlesSchema,
  newLessonSchema,
  type ModuleTitlesValues,
  type NewLessonValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

interface DialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
}

function DialogShell({ open, onOpenChange, title, description, children }: DialogShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function DialogActions({
  submitLabel,
  isPending,
  onCancel,
}: {
  submitLabel: string;
  isPending: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('actions.cancel')}
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? <Spinner /> : null}
        {submitLabel}
      </Button>
    </div>
  );
}

type ModuleTitles = Array<{ locale: Locale; title: string }>;

/** Asks for the title of a new module in every enabled language; only the default one is required. */
export function NewModuleDialog({
  open,
  onOpenChange,
  defaultLocale,
  locales,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLocale: Locale;
  locales: Locale[];
  onSubmit: (titles: ModuleTitles) => Promise<void>;
}) {
  const { t } = useTranslation(['studio', 'common']);
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t('studio:content.newModule.title')}
      description={t('studio:content.newModule.description', {
        language: t(`common:language.${defaultLocale}`),
      })}
    >
      <ModuleTitlesForm
        initialTitles={[]}
        defaultLocale={defaultLocale}
        locales={locales}
        submitLabel={t('studio:content.newModule.submit')}
        onCancel={() => onOpenChange(false)}
        onSubmit={onSubmit}
      />
    </DialogShell>
  );
}

/** Edits a module title in every enabled language. */
export function RenameModuleDialog({
  courseModule,
  course,
  locales,
  onOpenChange,
  onSubmit,
}: {
  /** The module being renamed; the dialog is open while this is set. */
  courseModule: CourseModuleWithLessons | null;
  course: CourseDetail;
  locales: Locale[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (moduleId: string, titles: ModuleTitles) => Promise<void>;
}) {
  const { t } = useTranslation(['studio', 'common']);
  return (
    <DialogShell
      open={courseModule !== null}
      onOpenChange={onOpenChange}
      title={t('studio:content.renameModuleDialog.title')}
      description={t('studio:content.renameModuleDialog.description')}
    >
      {courseModule ? (
        <ModuleTitlesForm
          // remounts per module so the form starts from the right titles
          key={courseModule.id}
          initialTitles={courseModule.translations}
          defaultLocale={course.defaultLocale}
          locales={locales}
          submitLabel={t('studio:content.renameModuleDialog.submit')}
          onCancel={() => onOpenChange(false)}
          onSubmit={(titles) => onSubmit(courseModule.id, titles)}
        />
      ) : null}
    </DialogShell>
  );
}

/** One title field per enabled language; the default language is required, the rest may stay empty. */
function ModuleTitlesForm({
  initialTitles,
  defaultLocale,
  locales,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialTitles: ModuleTitles;
  defaultLocale: Locale;
  locales: Locale[];
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (titles: ModuleTitles) => Promise<void>;
}) {
  const { t } = useTranslation(['studio', 'common']);
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ModuleTitlesValues>({
    resolver: zodResolver(moduleTitlesSchema),
    defaultValues: {
      defaultLocale,
      translations: Object.fromEntries(
        SUPPORTED_LOCALES.map((locale) => [
          locale,
          { title: initialTitles.find((item) => item.locale === locale)?.title ?? '' },
        ]),
      ) as ModuleTitlesValues['translations'],
    },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(
        locales.map((locale) => ({ locale, title: values.translations[locale].title })),
      );
      onCancel();
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <FormError message={formError} />
      {/* the required language comes first, which is also where the dialog puts the focus */}
      {[defaultLocale, ...locales.filter((locale) => locale !== defaultLocale)].map((locale) => (
        <TextField
          key={locale}
          label={t('studio:content.renameModuleDialog.titleIn', {
            language: t(`common:language.${locale}`),
          })}
          error={errors.translations?.[locale]?.title}
          {...register(`translations.${locale}.title`)}
        />
      ))}
      <DialogActions submitLabel={submitLabel} isPending={isSubmitting} onCancel={onCancel} />
    </form>
  );
}

/** Creates a lesson: type first, then its title in the course default language. */
export function NewLessonDialog({
  open,
  onOpenChange,
  defaultLocale,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLocale: Locale;
  onSubmit: (values: NewLessonValues) => Promise<void>;
}) {
  const { t } = useTranslation(['studio', 'common']);
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewLessonValues>({
    resolver: zodResolver(newLessonSchema),
    defaultValues: { type: 'video', title: '' },
  });

  const close = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
      close(false);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <DialogShell
      open={open}
      onOpenChange={close}
      title={t('studio:content.newLesson.title')}
      description={t('studio:content.newLesson.description', {
        language: t(`common:language.${defaultLocale}`),
      })}
    >
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <FormError message={formError} />
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('studio:content.newLesson.type')}</legend>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                className="sm:grid-cols-2"
              >
                {lessonTypeSchema.options.map((type) => (
                  <RadioOption
                    key={type}
                    value={type}
                    className="items-start rounded-lg border bg-surface p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent"
                  >
                    <LessonTypeIcon type={type} className="mt-0.5 size-4 shrink-0" />
                    <span className="space-y-0.5">
                      <span className="block font-medium">{t(`common:lessonTypes.${type}`)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`studio:content.newLesson.typeHint.${type}`)}
                      </span>
                    </span>
                  </RadioOption>
                ))}
              </RadioGroup>
            )}
          />
        </fieldset>
        <TextField
          label={t('studio:content.newLesson.name')}
          error={errors.title}
          {...register('title')}
        />
        <DialogActions
          submitLabel={t('studio:content.newLesson.submit')}
          isPending={isSubmitting}
          onCancel={() => close(false)}
        />
      </form>
    </DialogShell>
  );
}
