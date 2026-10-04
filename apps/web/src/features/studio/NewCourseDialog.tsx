import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FormError, SelectField, TextAreaField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useCreateCourse, useEnabledLocales } from '@/hooks/studioQueries';
import { toLocale } from '@/lib/content';
import { newCourseSchema, type NewCourseValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Dialog that creates a draft course and opens it in the editor. */
export function NewCourseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation(['studio', 'common']);
  const navigate = useNavigate();
  const locales = useEnabledLocales();
  const createCourse = useCreateCourse();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<NewCourseValues>({
    resolver: zodResolver(newCourseSchema),
    defaultValues: { title: '', description: '', defaultLocale: toLocale(i18n.resolvedLanguage) },
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      reset();
      setFormError(null);
    }
    onOpenChange(next);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const course = await createCourse.mutateAsync(values);
      toast.success(t('studio:newCourse.createdToast'));
      handleOpenChange(false);
      navigate(`/studio/courses/${course.id}/details`);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('studio:newCourse.title')}</DialogTitle>
        <DialogDescription>{t('studio:newCourse.description')}</DialogDescription>
        <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <FormError message={formError} />
          <TextField
            label={t('studio:newCourse.name')}
            error={errors.title}
            {...register('title')}
          />
          <TextAreaField
            label={t('studio:newCourse.summary')}
            hint={t('studio:newCourse.summaryHint')}
            error={errors.description}
            {...register('description')}
          />
          <SelectField
            label={t('studio:newCourse.defaultLanguage')}
            hint={t('studio:newCourse.defaultLanguageHint')}
            error={errors.defaultLocale}
            {...register('defaultLocale')}
          >
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {t(`common:language.${locale}`)}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" disabled={createCourse.isPending}>
              {createCourse.isPending ? <Spinner /> : null}
              {t('studio:newCourse.submit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
