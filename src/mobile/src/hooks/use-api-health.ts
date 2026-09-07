import { useQuery } from '@tanstack/react-query';

import { fetchApiReadiness } from '@/lib/api/health';

export const apiHealthQueryKey = ['api', 'health', 'ready'] as const;

export function useApiHealth() {
  return useQuery({
    queryKey: apiHealthQueryKey,
    queryFn: ({ signal }) => fetchApiReadiness(signal),
    refetchInterval: 15_000,
  });
}
