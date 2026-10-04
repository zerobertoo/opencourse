import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ErrorState, PageSkeleton } from '@/components/StateViews';
import { useAuth } from './AuthContext';

/** Protects routes that require a session; remembers the destination to return after sign-in. */
export function RequireAuth() {
  const { user, status, retry } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <ErrorState onRetry={retry} />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
