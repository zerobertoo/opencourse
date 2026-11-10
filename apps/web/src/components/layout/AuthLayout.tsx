import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router-dom';
import { CourseCover } from '@/components/CourseCover';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { RepositoryLink } from '@/components/RepositoryLink';
import { isApiMode } from '@/services';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card } from '@/components/ui/card';
import { useBrandLayout } from '@/lib/brandLayout';
import { cn } from '@/lib/utils';

/** Shared frame for the authentication screens; the language switcher is always visible. */
export function AuthLayout() {
  const { t } = useTranslation();
  const cinema = useBrandLayout() === 'cinema';

  return (
    <div className={cn('min-h-dvh', cinema && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,36rem)]')}>
      {cinema ? (
        <aside aria-hidden="true" className="relative hidden overflow-hidden bg-player lg:block">
          <CourseCover
            imageUrl={null}
            seed="opencourse-login"
            className="absolute inset-0 opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-player/80 via-player/20 to-transparent" />
          <p className="absolute inset-x-0 bottom-0 p-10 text-center text-sm text-player-foreground/90">
            {t('app.tagline')}
          </p>
        </aside>
      ) : null}
      <div className={cn(cinema && 'flex min-h-dvh flex-col')}>
        <header
          className={cn(
            'flex h-16 items-center justify-between gap-2 px-4',
            cinema ? 'lg:justify-end' : 'mx-auto max-w-5xl',
          )}
        >
          <Link to="/" aria-label={t('app.name')} className={cn('min-w-0', cinema && 'lg:hidden')}>
            <Logo />
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <main
          id="main-content"
          className={cn(
            'mx-auto w-full max-w-md px-4 pb-12 pt-6',
            cinema ? 'flex flex-1 flex-col justify-center' : 'sm:pt-12',
          )}
        >
          {cinema ? (
            <Link to="/" aria-label={t('app.name')} className="mb-8 hidden self-center lg:block">
              <Logo />
            </Link>
          ) : null}
          <Card className={cn(cinema ? 'border-0 bg-transparent p-0' : 'p-5 sm:p-8')}>
            <Outlet />
          </Card>
          <p
            className={cn(
              'text-center text-sm text-muted-foreground',
              cinema ? 'mt-8 lg:hidden' : 'mt-6',
            )}
          >
            {t('app.tagline')}
          </p>
          {isApiMode ? null : (
            <p className="mt-2 text-center">
              <RepositoryLink />
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
