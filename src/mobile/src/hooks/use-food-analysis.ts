import { useMutation, useQueryClient } from '@tanstack/react-query';

import { nutritionKeys } from '@/hooks/use-nutrition';
import { foodAnalysisApi, type ConfirmFoodAnalysisInput, type PickedPhoto } from '@/lib/api/food-analysis';

/**
 * Uploading a photo. This mutation never touches the diary — it produces a draft estimate and nothing else, so
 * no cache is invalidated here.
 */
export function useAnalyzeFoodPhoto() {
  return useMutation({
    mutationFn: ({ photo, clientRequestId, signal }: { photo: PickedPhoto; clientRequestId: string; signal?: AbortSignal }) =>
      foodAnalysisApi.analyze(photo, clientRequestId, signal),
  });
}

/**
 * Confirming the reviewed items. This is the only call in the flow that writes a meal, so it is the only one
 * that refreshes the diary and Home. The same request id travels with every retry, and the draft itself is the
 * server-side guard, so a lost response can never produce a second meal.
 */
export function useConfirmFoodAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, input, clientRequestId }: { draftId: string; input: ConfirmFoodAnalysisInput; clientRequestId: string; dates?: string[] }) =>
      foodAnalysisApi.confirm(draftId, input, clientRequestId),
    onSuccess: (_entry, variables) => {
      const dates = [...new Set(variables.dates ?? [])];
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: nutritionKeys.all }),
        ...dates.map((date) => queryClient.invalidateQueries({ queryKey: nutritionKeys.day(date) })),
      ]);
    },
  });
}

/** Throws away a draft the user decided against. Nothing was ever added, so nothing needs refreshing. */
export function useDiscardFoodAnalysis() {
  return useMutation({ mutationFn: (draftId: string) => foodAnalysisApi.discard(draftId) });
}
