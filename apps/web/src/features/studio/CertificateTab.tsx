import { zodResolver } from '@hookform/resolvers/zod';
import type { CourseDetail } from '@opencourse/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { CertificatePreview } from '@/components/CertificatePreview';
import { CheckboxField, FormError, TextAreaField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUpdateCourse } from '@/hooks/studioQueries';
import { localizeCourse, toLocale } from '@/lib/content';
import { useFormatters } from '@/lib/intl';
import {
  CERTIFICATE_MESSAGE_MAX_LENGTH,
  certificateTemplateFormSchema,
  type CertificateTemplateValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

/** Sample code shown in the preview; real certificates get a unique code when issued. */
const SAMPLE_CODE = 'OC-XXXX-XXXX';

/** Certificate tab: who signs it, an optional message and a live preview. */
export function CertificateTab({ course }: { course: CourseDetail }) {
  const { t, i18n } = useTranslation(['studio', 'student', 'common']);
  const { user } = useAuth();
  const { formatDate } = useFormatters(user?.timeZone);
  const updateCourse = useUpdateCourse(course.id);
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<CertificateTemplateValues>({
    resolver: zodResolver(certificateTemplateFormSchema),
    defaultValues: course.certificateTemplate,
  });

  const values = useWatch({ control });
  const courseTitle = localizeCourse(course, toLocale(i18n.resolvedLanguage)).title;

  const onSubmit = handleSubmit(async (formValues) => {
    setFormError(null);
    try {
      const saved = await updateCourse.mutateAsync({ certificateTemplate: formValues });
      reset(saved.certificateTemplate);
      toast.success(t('studio:certificate.savedToast'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError message={formError} />
        <CheckboxField
          label={t('studio:certificate.enabled')}
          hint={t('studio:certificate.enabledHint')}
          {...register('enabled')}
        />
        <TextField
          label={t('studio:certificate.signatoryName')}
          error={errors.signatoryName}
          {...register('signatoryName')}
        />
        <TextField
          label={t('studio:certificate.signatoryRole')}
          error={errors.signatoryRole}
          {...register('signatoryRole')}
        />
        <TextAreaField
          label={t('studio:certificate.message')}
          hint={t('studio:certificate.messageHint', { max: CERTIFICATE_MESSAGE_MAX_LENGTH })}
          error={errors.message}
          {...register('message')}
        />
        <Button type="submit" disabled={!isDirty || updateCourse.isPending}>
          {updateCourse.isPending ? <Spinner /> : null}
          {t('studio:certificate.save')}
        </Button>
      </form>

      <section aria-labelledby="certificate-preview-heading" className="space-y-3">
        <h2 id="certificate-preview-heading" className="text-xl font-semibold">
          {t('studio:certificate.previewTitle')}
        </h2>
        {values.enabled ? (
          <Card className="p-4">
            <CertificatePreview
              holderName={t('studio:certificate.sampleHolder')}
              courseTitle={courseTitle}
              issuedOn={formatDate(new Date())}
              code={SAMPLE_CODE}
              message={values.message}
              signatoryName={values.signatoryName}
              signatoryRole={values.signatoryRole}
            />
          </Card>
        ) : (
          <Card className="p-6 text-sm text-muted-foreground">
            {t('studio:certificate.disabledNotice')}
          </Card>
        )}
        <p className="text-xs text-muted-foreground">{t('studio:certificate.previewNote')}</p>
      </section>
    </div>
  );
}
