import { zodResolver } from '@hookform/resolvers/zod';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/StateViews';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { resetPasswordSchema, type ResetPasswordValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { useServices } from '@/services/ServicesContext';

/** New password form, opened from the link in the recovery e-mail (`?token=`). */
export function ResetPassword() {
  const { t } = useTranslation('auth');
  const { auth } = useServices();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() ?? '';
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema) });

  if (token === '') {
    return (
      <ErrorState
        title={t('reset.invalidTitle')}
        description={t('reset.invalidDescription')}
        onRetry={() => navigate('/forgot-password')}
        retryLabel={t('reset.requestNew')}
      />
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center" role="status">
        <CircleCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-semibold">{t('reset.doneTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('reset.doneDescription')}</p>
        <Button asChild className="w-full">
          <Link to="/login">{t('reset.goToLogin')}</Link>
        </Button>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await auth.resetPassword(token, password);
      setDone(true);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold">{t('reset.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('reset.subtitle')}</p>
      </div>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}
        <TextField
          label={t('fields.newPassword')}
          type="password"
          autoComplete="new-password"
          hint={t('fields.passwordHint')}
          error={errors.password}
          {...register('password')}
        />
        <TextField
          label={t('fields.confirmPassword')}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          {...register('confirmPassword')}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          {t('reset.submit')}
        </Button>
      </form>
    </div>
  );
}
