import type { Role } from '@opencourse/shared';
import { Outlet } from 'react-router-dom';
import { Forbidden } from '@/pages/Forbidden';
import { useAuth } from './AuthContext';

/** Requires one of the given roles; without permission it shows the 403 screen. Use inside `RequireAuth`. */
export function RequireRole({ roles }: { roles: readonly Role[] }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Forbidden />;
  return <Outlet />;
}
