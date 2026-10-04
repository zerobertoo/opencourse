import type { User } from '@opencourse/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/hooks/queries';
import { useServices } from '@/services/ServicesContext';
import { AuthContext, type AuthContextValue } from './AuthContext';

/** User session, derived from `services.auth` and kept in the query cache. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth } = useServices();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.me,
    queryFn: () => auth.getCurrentUser(),
    staleTime: Infinity,
  });

  const value = useMemo<AuthContextValue>(() => {
    /** Stores the user and discards cached data that belonged to the previous session. */
    const startSession = (user: User): User => {
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      queryClient.setQueryData(queryKeys.me, user);
      return user;
    };

    return {
      user: session.data ?? null,
      status: session.isPending ? 'loading' : session.isError ? 'error' : 'ready',
      retry: () => void session.refetch(),
      signIn: async (email, password) => startSession(await auth.signIn(email, password)),
      signInAs: async (role) => startSession(await auth.signInAs(role)),
      signUp: async (input) => startSession(await auth.signUp(input)),
      acceptInvite: async (token, input) => startSession(await auth.acceptInvite(token, input)),
      signOut: async () => {
        await auth.signOut();
        queryClient.clear();
        queryClient.setQueryData(queryKeys.me, null);
      },
      setUser: (user) => queryClient.setQueryData(queryKeys.me, user),
    };
  }, [auth, queryClient, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
