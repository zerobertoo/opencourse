import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

/** Outlet that shows a skeleton while a lazy route chunk loads, keeping the surrounding layout visible. */
export function RouteSuspense() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div role="status" aria-busy="true">
          <span className="sr-only">{t('states.loading')}</span>
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  );
}
