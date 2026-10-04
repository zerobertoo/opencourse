import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { useServices } from '@/services/ServicesContext';

/** Password recovery request. It never reveals whether the e-mail exists. */
export function ForgotPassword() {
  const { t } = useTranslation('auth');
  const { auth } = useServices();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await auth.requestPasswordReset(email);
      setSentTo(email);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  if (sentTo) {
    return (
      <div className="space-y-4 text-center" role="status">
        <MailCheck className="mx-auto size-8 text-primary" aria-hidden="true" />
        <h1 className="font-serif text-2xl font-semibold">{t('forgot.sentTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('forgot.sentDescription', { email: sentTo })}
        </p>
        {/* the mock has no mailbox: this link stands in for the one in the e-mail */}
        <Button asChild variant="outline" className="w-full">
          <Link to="/reset-password?token=demo-token">{t('forgot.openDemoLink')}</Link>
        </Button>
        <Link to="/login" className="block text-sm text-primary underline-offset-4 hover:underline">
          {t('forgot.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold">{t('forgot.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('forgot.subtitle')}</p>
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
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          {t('forgot.submit')}
        </Button>
      </form>
      <Link
        to="/login"
        className="block text-center text-sm text-primary underline-offset-4 hover:underline"
      >
        {t('forgot.backToLogin')}
      </Link>
    </div>
  );
}
