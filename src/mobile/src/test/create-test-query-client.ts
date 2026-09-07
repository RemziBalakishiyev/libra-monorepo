import { QueryClient } from '@tanstack/react-query';

/**
 * QueryClient for Jest. Production defaults keep finished queries and mutations alive for five minutes
 * (`gcTime`), which leaves a timer running after a test and keeps the Jest process from exiting.
 * Tests must not retry either, so failures surface immediately.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false, gcTime: 0 },
    },
  });
}
