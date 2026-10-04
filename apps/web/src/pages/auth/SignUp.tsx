import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { getPostLoginPath, useAuth } from '@/auth/AuthContext';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { signUpSchema, type SignUpValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { isServiceError } from '@/services';

/** Account creation screen. */
export function SignUp() {
  const { t } = useTranslation('auth');
  const { user, signUp } = useAuth();
  const location = useLocation();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  if (user) return <Navigate to={getPostLoginPath(location.state, user.role)} replace />;

  const onSubmit = handleSubmit(async ({ name, email, password }) => {
    setFormError(null);
    try {
      await signUp({ name, email, password });
    } catch (error) {
      setFormError(
        isServiceError(error) && error.code === 'conflict'
          ? t('signUp.emailTaken')
          : describeError(error),
      );
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold">{t('signUp.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('signUp.subtitle')}</p>
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
          label={t('fields.name')}
          autoComplete="name"
          error={errors.name}
          {...register('name')}
        />
        <TextField
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          error={errors.email}
          {...register('email')}
        />
        <TextField
          label={t('fields.password')}
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
          {t('signUp.submit')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {t('signUp.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('signUp.signIn')}
        </Link>
      </p>
    </div>
  );
}
