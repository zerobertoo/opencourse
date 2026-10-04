import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.home', end: true },
  { to: '/certificates', labelKey: 'nav.certificates', end: false },
] as const;

/** Search box that filters "my courses" on the home page through the `q` query param. */
function SearchForm({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  return (
    <form
      role="search"
      className={cn('relative', className)}
      onSubmit={(event) => {
        event.preventDefault();
        const query = String(new FormData(event.currentTarget).get('q') ?? '').trim();
        navigate(query ? `/?q=${encodeURIComponent(query)}` : '/');
      }}
    >
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        // remount when the URL query changes so the field mirrors it
        key={params.get('q') ?? ''}
        type="search"
        name="q"
        defaultValue={params.get('q') ?? ''}
        aria-label={t('search.label')}
        placeholder={t('search.placeholder')}
        className="h-10 w-full rounded-md border bg-surface ps-9 pe-3 text-sm"
      />
    </form>
  );
}

/** Student area layout: topbar with navigation, search, language, theme and account menu. */
export function StudentLayout() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
          <Link to="/" aria-label={t('app.name')} className="shrink-0">
            <span className="hidden sm:inline">
              <Logo />
            </span>
            <span className="sm:hidden">
              <Logo showName={false} />
            </span>
          </Link>
          {user ? (
            <nav
              aria-label={t('nav.mainNavigation')}
              className="ms-2 hidden items-center gap-1 md:flex"
            >
              {NAV_ITEMS.map(({ to, labelKey, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted',
                      isActive && 'bg-accent text-accent-foreground',
                    )
                  }
                >
                  {t(labelKey)}
                </NavLink>
              ))}
            </nav>
          ) : null}
          {user ? <SearchForm className="ms-2 hidden flex-1 sm:block sm:max-w-md" /> : null}
          <div className="ms-auto flex items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
        {user ? (
          <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-3 sm:hidden">
            <SearchForm className="flex-1" />
          </div>
        ) : null}
      </header>
      {user ? (
        <nav
          aria-label={t('nav.mainNavigation')}
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pt-3 md:hidden"
        >
          {NAV_ITEMS.map(({ to, labelKey, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
            >
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      ) : null}
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
