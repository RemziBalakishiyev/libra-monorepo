import { useQuery } from '@tanstack/react-query';

import { focusApi } from '@/lib/api/focus';

export const focusKeys = {
  all: ['focus'] as const,
  summary: () => ['focus', 'summary'] as const,
};

/**
 * Today's recorded focus, as the server counts it in the profile time zone.
 *
 * It is history, not the running timer: the Focus screen and the card read the live phase from the store, and
 * this only says what has already been recorded. A failure is not surfaced anywhere — a summary that has not
 * loaded simply is not shown, rather than reporting a zero that would read as "you did nothing today".
 */
export function useFocusSummary() {
  return useQuery({
    queryKey: focusKeys.summary(),
    queryFn: ({ signal }) => focusApi.summary(signal),
  });
}
