import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

/** Outlet that shows a skeleton while a lazy route chunk loads, keeping the surrounding layout visible. */
export function RouteSuspense() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Outlet />
    </Suspense>
  );
}
