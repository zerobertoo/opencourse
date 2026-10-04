import { zodResolver } from '@hookform/resolvers/zod';
import {
  SUPPORTED_LOCALES,
  getTranslationCoverage,
  type CourseDetail,
  type Locale,
} from '@opencourse/shared';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { FormError, SelectField, TextAreaField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress';
import { LocaleTabs } from '@/features/studio/LocaleTabs';
import { useEnabledLocales, useUpdateCourse } from '@/hooks/studioQueries';
import { courseDetailsSchema, type CourseDetailsValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** One learning outcome per line in the form, an array in the course. */
function splitOutcomes(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function toFormValues(course: CourseDetail): CourseDetailsValues {
  const translations = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => {
      const saved = course.translations.find((item) => item.locale === locale);
      return [
        locale,
        {
          title: saved?.title ?? '',
          description: saved?.description ?? '',
          learningOutcomes: (saved?.learningOutcomes ?? []).join('\n'),
        },
      ];
    }),
  ) as CourseDetailsValues['translations'];
  return { defaultLocale: course.defaultLocale, translations };
}

/** Details tab: title, description and learning outcomes per language. */
export function DetailsTab({ course }: { course: CourseDetail }) {
  const { t } = useTranslation(['studio', 'common']);
  const locales = useEnabledLocales(course);
  const updateCourse = useUpdateCourse(course.id);
  const describeError = useServiceErrorMessage();
  const [activeLocale, setActiveLocale] = useState<Locale>(course.defaultLocale);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CourseDetailsValues>({
    resolver: zodResolver(courseDetailsSchema),
    defaultValues: toFormValues(course),
  });

  const coverage = useMemo(
    () => new Map(locales.map((locale) => [locale, getTranslationCoverage(course, locale)])),
    [course, locales],
  );
  const incomplete = new Set(locales.filter((locale) => !coverage.get(locale)?.isComplete));

  const onSubmit = handleSubmit(
    async (values) => {
      setFormError(null);
      try {
        const saved = await updateCourse.mutateAsync({
          defaultLocale: values.defaultLocale,
          translations: SUPPORTED_LOCALES.filter(
            (locale) =>
              locales.includes(locale) &&
              (course.translations.some((item) => item.locale === locale) ||
                values.translations[locale].title.trim() !== ''),
          ).map((locale) => {
            const fields = values.translations[locale];
            return {
              locale,
              title: fields.title.trim(),
              description: fields.description.trim(),
              learningOutcomes: splitOutcomes(fields.learningOutcomes),
            };
          }),
        });
        reset(toFormValues(saved));
        toast.success(t('studio:details.savedToast'));
      } catch (error) {
        setFormError(describeError(error));
      }
    },
    (invalid) => {
      // reveal the language tab that holds the first error
      const firstWithError = locales.find((locale) => invalid.translations?.[locale]);
      if (firstWithError) setActiveLocale(firstWithError);
    },
  );

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-5">
      <FormError message={formError} />

      <SelectField
        label={t('studio:details.defaultLanguage')}
        hint={t('studio:details.defaultLanguageHint')}
        error={errors.defaultLocale}
        className="max-w-xs"
        {...register('defaultLocale')}
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {t(`common:language.${locale}`)}
          </option>
        ))}
      </SelectField>

      <Card className="p-4 sm:p-5">
        <LocaleTabs
          locales={locales}
          value={activeLocale}
          onValueChange={setActiveLocale}
          incomplete={incomplete}
          label={t('studio:details.languagesLabel')}
        >
          {(locale) => {
            const stats = coverage.get(locale);
            const isDefault = locale === course.defaultLocale;
            return (
              <div className="space-y-4">
                {stats && !stats.isComplete ? (
                  <div
                    role="status"
                    className="space-y-2 rounded-lg border border-destructive/40 p-3 text-sm"
                  >
                    <p className="flex items-center gap-2 font-medium text-destructive">
                      <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
                      {t('studio:translation.incompleteTitle', {
                        language: t(`common:language.${locale}`),
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      {isDefault
                        ? t('studio:translation.incompleteDefaultHint')
                        : t('studio:translation.incompleteHint', {
                            language: t(`common:language.${course.defaultLocale}`),
                          })}
                    </p>
                    <ProgressBar
                      value={stats.ratio}
                      label={t('studio:translation.progressLabel', {
                        language: t(`common:language.${locale}`),
                      })}
                    />
                    <p className="font-mono text-xs text-muted-foreground">
                      {t('studio:translation.coverage', {
                        translated: stats.translated,
                        total: stats.total,
                      })}
                    </p>
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/studio/courses/${course.id}/content`}>
                        {t('studio:translation.goToContent')}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t('studio:translation.complete', {
                      language: t(`common:language.${locale}`),
                    })}
                  </p>
                )}

                <TextField
                  label={t('studio:details.titleField')}
                  hint={isDefault ? t('studio:details.titleRequiredHint') : undefined}
                  error={errors.translations?.[locale]?.title}
                  {...register(`translations.${locale}.title`)}
                />
                <TextAreaField
                  label={t('studio:details.descriptionField')}
                  className="min-h-32"
                  error={errors.translations?.[locale]?.description}
                  {...register(`translations.${locale}.description`)}
                />
                <TextAreaField
                  label={t('studio:details.outcomesField')}
                  hint={t('studio:details.outcomesHint')}
                  error={errors.translations?.[locale]?.learningOutcomes}
                  {...register(`translations.${locale}.learningOutcomes`)}
                />
              </div>
            );
          }}
        </LocaleTabs>
      </Card>

      <Button type="submit" disabled={!isDirty || updateCourse.isPending}>
        {updateCourse.isPending ? <Spinner /> : null}
        {t('studio:details.save')}
      </Button>
    </form>
  );
}
