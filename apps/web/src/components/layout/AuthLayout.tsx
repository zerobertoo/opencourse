import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card } from '@/components/ui/card';

/** Shared frame for the authentication screens; the language switcher is always visible. */
export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-2 px-4">
        <Link to="/" aria-label={t('app.name')}>
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main id="main-content" className="mx-auto w-full max-w-md px-4 pb-12 pt-6 sm:pt-12">
        <Card className="p-5 sm:p-8">
          <Outlet />
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">{t('app.tagline')}</p>
      </main>
    </div>
  );
}
