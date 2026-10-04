import { QueryClient } from '@tanstack/react-query';

/** No automatic retries: failures show up as an error state with "try again". */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
