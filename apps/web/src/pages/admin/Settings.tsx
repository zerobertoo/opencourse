import { zodResolver } from '@hookform/resolvers/zod';
import { SUPPORTED_LOCALES, type PlatformSettings } from '@opencourse/shared';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckboxField, FormError, SelectField } from '@/components/FormFields';
import { Spinner } from '@/components/Spinner';
import { ErrorState, PageSkeleton } from '@/components/StateViews';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlatformSettings, useUpdateSettings } from '@/hooks/adminQueries';
import { platformSettingsFormSchema, type PlatformSettingsFormValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

function toFormValues(settings: PlatformSettings): PlatformSettingsFormValues {
  return {
    brandName: settings.brand.name,
    logoUrl: settings.brand.logoUrl ?? '',
    primaryColor: settings.brand.primaryColor,
    enabledLocales: settings.enabledLocales,
    defaultLocale: settings.defaultLocale,
    host: settings.email.host,
    port: String(settings.email.port),
    username: settings.email.username,
    fromAddress: settings.email.fromAddress,
    secure: settings.email.secure,
  };
}

function toSettingsPatch(values: PlatformSettingsFormValues): PlatformSettings {
  return {
    brand: {
      name: values.brandName,
      logoUrl: values.logoUrl === '' ? null : values.logoUrl,
      primaryColor: values.primaryColor,
    },
    enabledLocales: values.enabledLocales,
    defaultLocale: values.defaultLocale,
    email: {
      host: values.host,
      port: Number(values.port),
      username: values.username,
      fromAddress: values.fromAddress,
      secure: values.secure,
    },
  };
}

function SettingsForm({ settings }: { settings: PlatformSettings }) {
  const { t } = useTranslation(['admin', 'common']);
  const update = useUpdateSettings();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<PlatformSettingsFormValues>({
    resolver: zodResolver(platformSettingsFormSchema),
    defaultValues: toFormValues(settings),
  });
  const primaryColor = useWatch({ control, name: 'primaryColor' });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync(toSettingsPatch(values));
      reset(toFormValues(saved));
      toast.success(t('admin:settings.savedToast'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <FormError message={formError} />

      <Card role="region" aria-labelledby="settings-brand" className="space-y-4 p-5">
        <h3 id="settings-brand" className="text-lg font-semibold">
          {t('admin:settings.brand.title')}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('admin:settings.brand.name')}
            error={errors.brandName}
            {...register('brandName')}
          />
          <TextField
            label={t('admin:settings.brand.logoUrl')}
            hint={t('admin:settings.brand.logoUrlHint')}
            error={errors.logoUrl}
            {...register('logoUrl')}
          />
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextField
                label={t('admin:settings.brand.primaryColor')}
                error={errors.primaryColor}
                {...register('primaryColor')}
              />
            </div>
            <span
              aria-hidden="true"
              className="mb-px size-10 shrink-0 rounded-md border"
              style={{ backgroundColor: primaryColor }}
            />
          </div>
        </div>
      </Card>

      <Card role="region" aria-labelledby="settings-languages" className="space-y-4 p-5">
        <h3 id="settings-languages" className="text-lg font-semibold">
          {t('admin:settings.languages.title')}
        </h3>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">{t('admin:settings.languages.enabled')}</legend>
          {SUPPORTED_LOCALES.map((locale) => (
            <CheckboxField
              key={locale}
              label={t(`common:language.${locale}`)}
              value={locale}
              {...register('enabledLocales')}
            />
          ))}
          {errors.enabledLocales?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`common:${errors.enabledLocales.message}` as 'common:validation.required')}
            </p>
          ) : null}
        </fieldset>
        <div className="max-w-sm">
          <SelectField
            label={t('admin:settings.languages.default')}
            hint={t('admin:settings.languages.defaultHint')}
            error={errors.defaultLocale}
            {...register('defaultLocale')}
          >
            {SUPPORTED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {t(`common:language.${locale}`)}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      <Card role="region" aria-labelledby="settings-email" className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 id="settings-email" className="text-lg font-semibold">
            {t('admin:settings.email.title')}
          </h3>
          <p className="text-sm text-muted-foreground">{t('admin:settings.email.description')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('admin:settings.email.host')}
            error={errors.host}
            {...register('host')}
          />
          <TextField
            label={t('admin:settings.email.port')}
            inputMode="numeric"
            className="font-mono"
            error={errors.port}
            {...register('port')}
          />
          <TextField
            label={t('admin:settings.email.username')}
            autoComplete="off"
            error={errors.username}
            {...register('username')}
          />
          <TextField
            type="email"
            label={t('admin:settings.email.fromAddress')}
            error={errors.fromAddress}
            {...register('fromAddress')}
          />
        </div>
        <CheckboxField
          label={t('admin:settings.email.secure')}
          hint={t('admin:settings.email.secureHint')}
          {...register('secure')}
        />
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || update.isPending}
          onClick={() => reset(toFormValues(settings))}
        >
          {t('admin:settings.discard')}
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Spinner /> : null}
          {t('admin:settings.save')}
        </Button>
      </div>
    </form>
  );
}

/** Instance settings: branding, languages and transactional e-mail (mocked, nothing is sent). */
export function AdminSettings() {
  const { t } = useTranslation('admin');
  const query = usePlatformSettings();

  let body: React.ReactNode;
  if (query.isPending) body = <PageSkeleton />;
  else if (query.isError) body = <ErrorState onRetry={() => void query.refetch()} />;
  else body = <SettingsForm settings={query.data} />;

  return (
    <section aria-labelledby="admin-settings-heading" className="space-y-4">
      <h2 id="admin-settings-heading" className="text-xl font-semibold">
        {t('settings.title')}
      </h2>
      {body}
    </section>
  );
}
