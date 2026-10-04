import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/auth/AuthProvider';
import { createQueryClient } from '@/lib/queryClient';
import { ServicesProvider } from '@/services/ServicesProvider';
import type { Services } from '@/services/types';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * Everything the app needs above the router: theme, services, query cache and session.
 * `services` and `queryClient` can be injected (tests); the defaults are used in production.
 */
export function AppProviders({
  children,
  services,
  queryClient,
}: {
  children: React.ReactNode;
  services?: Services;
  queryClient?: QueryClient;
}) {
  const [defaultClient] = useState(createQueryClient);

  const tree = (
    <QueryClientProvider client={queryClient ?? defaultClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );

  return (
    <ThemeProvider>
      {services ? <ServicesProvider services={services}>{tree}</ServicesProvider> : tree}
    </ThemeProvider>
  );
}
