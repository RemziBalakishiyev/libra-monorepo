import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  nutritionApi,
  type NutritionEntryFilters,
  type NutritionEntryInput,
  type NutritionGoalInput,
} from '@/lib/api/nutrition';

/**
 * Every nutrition query lives under 'nutrition' and carries the local date it describes, so switching days
 * starts a new query and a mutation can refresh exactly the days it touched. The key does not repeat the user
 * id: signing out clears the whole cache (see the session store), so no other user ever reads these rows.
 */
export const nutritionKeys = {
  all: ['nutrition'] as const,
  day: (date: string | undefined) => ['nutrition', 'day', date ?? 'today'] as const,
  entries: (filters: NutritionEntryFilters) => ['nutrition', 'entries', filters] as const,
  entry: (id: string) => ['nutrition', 'entries', 'item', id] as const,
  goals: () => ['nutrition', 'goals'] as const,
};

/**
 * Refreshes the diary. Both the day an entry left and the day it moved to are invalidated, and Home's summary
 * (the day query for today) comes along because it uses the same key space.
 */
function useInvalidateNutrition() {
  const queryClient = useQueryClient();
  return (dates: (string | undefined)[] = []) => {
    const unique = [...new Set(dates)];
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: nutritionKeys.all }),
      ...unique.map((date) => queryClient.invalidateQueries({ queryKey: nutritionKeys.day(date) })),
    ]);
  };
}

/** One local calendar day: totals, the applicable goal, and the entries grouped by meal. */
export function useNutritionDay(date: string | undefined) {
  return useQuery({
    queryKey: nutritionKeys.day(date),
    queryFn: ({ signal }) => nutritionApi.day(date, signal),
  });
}

export function useNutritionEntries(filters: NutritionEntryFilters) {
  return useInfiniteQuery({
    queryKey: nutritionKeys.entries(filters),
    queryFn: ({ pageParam, signal }) => nutritionApi.listEntries(filters, pageParam, 20, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.pageNumber + 1 : undefined),
  });
}

export function useNutritionEntry(id: string | undefined) {
  return useQuery({
    queryKey: nutritionKeys.entry(id ?? ''),
    queryFn: ({ signal }) => nutritionApi.getEntry(id!, signal),
    enabled: Boolean(id),
  });
}

export function useNutritionGoals() {
  return useQuery({
    queryKey: nutritionKeys.goals(),
    queryFn: ({ signal }) => nutritionApi.goals(signal),
  });
}

export function useCreateNutritionEntry() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: NutritionEntryInput; clientRequestId: string; dates?: string[] }) =>
      nutritionApi.createEntry(input, clientRequestId),
    onSuccess: (_data, variables) => invalidate(variables.dates),
  });
}

export function useUpdateNutritionEntry() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    // `dates` carries the day the entry left and the day it lands on, so both summaries refresh.
    mutationFn: ({ id, input }: { id: string; input: NutritionEntryInput; dates?: string[] }) => nutritionApi.updateEntry(id, input),
    onSuccess: (_data, variables) => invalidate(variables.dates),
  });
}

export function useDeleteNutritionEntry() {
  const invalidate = useInvalidateNutrition();
  return useMutation({
    mutationFn: ({ id }: { id: string; dates?: string[] }) => nutritionApi.deleteEntry(id),
    onSuccess: (_data, variables) => invalidate(variables.dates),
  });
}

export function useSaveNutritionGoal() {
  const invalidate = useInvalidateNutrition();
  return useMutation({ mutationFn: (input: NutritionGoalInput) => nutritionApi.saveGoal(input), onSuccess: () => invalidate() });
}
