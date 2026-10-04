import { zodResolver } from '@hookform/resolvers/zod';
import type { Role } from '@opencourse/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { getPostLoginPath, useAuth } from '@/auth/AuthContext';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { loginSchema, type LoginValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';

const DEMO_ROLES: readonly Role[] = ['student', 'instructor', 'admin'];

/** Sign-in screen. The mock accepts any credentials and offers one-click demo accounts. */
export function Login() {
  const { t } = useTranslation(['auth', 'common']);
  const { user, signIn, signInAs } = useAuth();
  const location = useLocation();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<Role | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  if (user) return <Navigate to={getPostLoginPath(location.state, user.role)} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      await signIn(email, password);
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  const onDemo = async (role: Role) => {
    setFormError(null);
    setPendingRole(role);
    try {
      await signInAs(role);
    } catch (error) {
      setFormError(describeError(error));
      setPendingRole(null);
    }
  };

  const busy = isSubmitting || pendingRole !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('login.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
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
        <TextField
          label={t('fields.password')}
          type="password"
          autoComplete="current-password"
          error={errors.password}
          {...register('password')}
        />
        <div className="text-end">
          <Link
            to="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            {t('login.forgotPassword')}
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {isSubmitting ? <Spinner /> : null}
          {t('login.submit')}
        </Button>
      </form>

      <section aria-labelledby="demo-heading" className="space-y-3 border-t pt-5">
        <h2 id="demo-heading" className="text-sm font-medium text-muted-foreground">
          {t('login.demoTitle')}
        </h2>
        <div className="grid gap-2">
          {DEMO_ROLES.map((role) => (
            <Button
              key={role}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void onDemo(role)}
            >
              {pendingRole === role ? <Spinner /> : null}
              {t(`login.demo.${role}`)}
            </Button>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          {t('login.signUp')}
        </Link>
      </p>
    </div>
  );
}
