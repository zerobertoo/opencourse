import { zodResolver } from '@hookform/resolvers/zod';
import { SUPPORTED_LOCALES } from '@opencourse/shared';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthContext';
import { Spinner } from '@/components/Spinner';
import { TextField } from '@/components/TextField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import {
  changePasswordSchema,
  profileSchema,
  type ChangePasswordValues,
  type ProfileValues,
} from '@/lib/schemas';
import { useServiceErrorMessage } from '@/lib/serviceError';
import { useServices } from '@/services/ServicesContext';
import { useTheme, type ThemePreference } from '@/theme/useTheme';

const THEME_OPTIONS = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
  { value: 'system', icon: Monitor },
] as const satisfies ReadonlyArray<{ value: ThemePreference; icon: React.ElementType }>;

/** All IANA time zones the browser knows, plus the user's current one if it is missing. */
function listTimeZones(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function ProfileSection() {
  const { t, i18n } = useTranslation(['student', 'common']);
  const { user, setUser } = useAuth();
  const { users } = useServices();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const timeZones = useMemo(() => listTimeZones(user?.timeZone ?? 'UTC'), [user?.timeZone]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name, locale: user?.locale, timeZone: user?.timeZone },
  });

  if (!user) return null;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const updated = await users.updateProfile(values);
      setUser(updated);
      reset(values);
      // the interface follows the saved language right away
      await i18n.changeLanguage(updated.locale);
      toast.success(t('settings.profile.savedToast'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-semibold">{t('settings.profile.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.profile.description')}</p>
        </div>
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}
        <TextField
          label={t('settings.profile.name')}
          autoComplete="name"
          error={errors.name}
          {...register('name')}
        />
        <TextField label={t('settings.profile.email')} value={user.email} readOnly disabled />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="profile-locale" className="text-sm font-medium">
              {t('settings.profile.language')}
            </label>
            <Select id="profile-locale" {...register('locale')}>
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {t(`common:language.${locale}`)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="profile-timezone" className="text-sm font-medium">
              {t('settings.profile.timeZone')}
            </label>
            <Select id="profile-timezone" {...register('timeZone')}>
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          {t('settings.profile.save')}
        </Button>
      </form>
    </Card>
  );
}

function ThemeSection() {
  const { t } = useTranslation(['student', 'common']);
  const { preference, setPreference } = useTheme();

  return (
    <Card className="p-5">
      <fieldset className="space-y-4">
        <legend className="font-serif text-xl font-semibold">{t('settings.theme.title')}</legend>
        <p className="text-sm text-muted-foreground">{t('settings.theme.description')}</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, icon: Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border bg-surface p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={preference === value}
                onChange={() => setPreference(value)}
                className="size-4 accent-primary"
              />
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              {t(`common:theme.${value}`)}
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

function PasswordSection() {
  const { t } = useTranslation(['student', 'common']);
  const { auth } = useServices();
  const describeError = useServiceErrorMessage();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues>({ resolver: zodResolver(changePasswordSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, password }) => {
    setFormError(null);
    try {
      await auth.changePassword(currentPassword, password);
      reset();
      toast.success(t('settings.password.savedToast'));
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <Card className="p-5">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-semibold">{t('settings.password.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('settings.password.description')}</p>
        </div>
        {formError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            {formError}
          </p>
        ) : null}
        <TextField
          label={t('settings.password.current')}
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword}
          {...register('currentPassword')}
        />
        <TextField
          label={t('settings.password.new')}
          type="password"
          autoComplete="new-password"
          hint={t('settings.password.hint')}
          error={errors.password}
          {...register('password')}
        />
        <TextField
          label={t('settings.password.confirm')}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword}
          {...register('confirmPassword')}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : null}
          {t('settings.password.save')}
        </Button>
      </form>
    </Card>
  );
}

/** Account settings: profile, language, time zone, theme and password. */
export function Settings() {
  const { t } = useTranslation(['student', 'common']);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{t('settings.title')}</h1>
        <p className="text-muted-foreground">{t('settings.subtitle')}</p>
      </div>
      <ProfileSection />
      <ThemeSection />
      <PasswordSection />
    </div>
  );
}
