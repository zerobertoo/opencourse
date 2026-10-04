import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';

const SECTIONS = ['users', 'grants', 'settings', 'plugins'] as const;

/** Shell of the admin area: title and section navigation above the active section. */
export function AdminLayout() {
  const { t } = useTranslation('admin');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold sm:text-3xl">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
      </div>
      <nav aria-label={t('nav.label')} className="flex gap-1 overflow-x-auto border-b">
        {SECTIONS.map((section) => (
          <NavLink
            key={section}
            to={`/admin/${section}`}
            className={({ isActive }) =>
              cn(
                '-mb-px shrink-0 border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground',
                isActive && 'border-primary text-foreground',
              )
            }
          >
            {t(`nav.${section}`)}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
