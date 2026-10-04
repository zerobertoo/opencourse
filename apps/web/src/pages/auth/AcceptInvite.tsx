import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { ErrorState } from '@/components/StateViews';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { queryKeys } from '@/hooks/queries';
import { localizeCourse, toLocale } from '@/lib/content';
import { acceptInviteSchema, type AcceptInviteValues } from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { isServiceError } from '@/services';
import { useServices } from '@/services/ServicesContext';

/** Invite acceptance: shows who was invited (and to which course) and creates the account. */
export function AcceptInvite() {
  const { t, i18n } = useTranslation(['auth', 'common']);
  const { token = '' } = useParams();
  const { auth, courses } = useServices();
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);

  const invite = useQuery({
    queryKey: queryKeys.invite(token),
    queryFn: async () => {
      const found = await auth.getInvite(token);
      const course = found.courseId ? await courses.getById(found.courseId) : null;
      return { invite: found, course };
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInviteValues>({ resolver: zodResolver(acceptInviteSchema) });

  if (invite.isPending) {
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{t('common:states.loading')}</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (invite.isError) {
    const code = isServiceError(invite.error) ? invite.error.code : null;
    // an unknown or already used/expired invite cannot be fixed by retrying
    if (code === 'not_found' || code === 'conflict') {
      return (
        <ErrorState
          title={t('invite.invalidTitle')}
          description={t('invite.invalidDescription')}
          onRetry={() => navigate('/login')}
          retryLabel={t('invite.goToLogin')}
        />
      );
    }
    return <ErrorState onRetry={() => void invite.refetch()} />;
  }

  const { invite: pending, course } = invite.data;
  const courseTitle = course ? localizeCourse(course, toLocale(i18n.resolvedLanguage)).title : null;

  const onSubmit = handleSubmit(async ({ name, password }) => {
    setFormError(null);
    try {
      await acceptInvite(token, { name, password });
      navigate('/', { replace: true });
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold">{t('invite.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {courseTitle
            ? t('invite.subtitleWithCourse', { course: courseTitle })
            : t('invite.subtitle')}
        </p>
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
        <TextField label={t('fields.email')} type="email" value={pending.email} readOnly />
        <TextField
          label={t('fields.name')}
          autoComplete="name"
          error={errors.name}
          {...register('name')}
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
          {t('invite.submit')}
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
