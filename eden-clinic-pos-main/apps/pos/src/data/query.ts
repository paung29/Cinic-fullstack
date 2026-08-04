import { QueryClient } from '@tanstack/react-query';

export function createClinicQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
      },
    },
  });
}
