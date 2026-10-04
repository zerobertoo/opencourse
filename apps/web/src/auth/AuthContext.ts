import type { Role, User } from '@opencourse/shared';
import type { AcceptInviteInput, SignUpInput } from '@/services';
import { createContext, useContext } from 'react';

export interface AuthContextValue {
  user: User | null;
  /** `loading` while the session is checked; `error` if the check fails. */
  status: 'loading' | 'error' | 'ready';
  retry: () => void;
  signIn: (email: string, password: string) => Promise<User>;
  signInAs: (role: Role) => Promise<User>;
  signUp: (input: SignUpInput) => Promise<User>;
  acceptInvite: (token: string, input: AcceptInviteInput) => Promise<User>;
  signOut: () => Promise<void>;
  /** Updates the cached user after the profile is edited. */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/**
 * Where to go after signing in: the page the user was trying to open (only internal paths),
 * otherwise the home area of their role.
 */
export function getPostLoginPath(state: unknown, role: Role): string {
  const from = (state as { from?: unknown } | null)?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) return from;
  return homePathForRole(role);
}

/** Home area of each role after signing in. */
export function homePathForRole(role: Role): string {
  if (role === 'admin') return '/admin';
  if (role === 'instructor') return '/studio';
  return '/';
}
