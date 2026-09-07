import { QueryClient } from '@tanstack/react-query';

/** Single QueryClient for server state. Client/UI-only state must not go through this. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 10_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
