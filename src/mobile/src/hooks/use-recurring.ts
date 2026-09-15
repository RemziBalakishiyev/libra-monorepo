import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { financeKeys } from '@/hooks/use-finance';
import { recurringApi, type RecordOccurrenceInput, type RecurringTemplateInput, type RecurringTemplateUpdateInput } from '@/lib/api/recurring';

/**
 * Nested under 'finance' on purpose: recording a month creates an ordinary transaction, which moves balances,
 * budgets and the dashboard, and every finance mutation already invalidates that whole prefix. The plan itself
 * lives with the rest of the module's server state.
 */
export const recurringKeys = {
  all: ['finance', 'recurring'] as const,
  month: (year: number, month: number) => ['finance', 'recurring', 'month', year, month] as const,
  templates: () => ['finance', 'recurring', 'templates'] as const,
  template: (id: string) => ['finance', 'recurring', 'templates', id] as const,
};

function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
}

/** The selected month. Reading it — as often as it refetches — records nothing. */
export function useRecurringMonth(year: number, month: number) {
  return useQuery({
    queryKey: recurringKeys.month(year, month),
    queryFn: ({ signal }) => recurringApi.month(year, month, signal),
  });
}

export function useRecurringTemplates() {
  return useQuery({ queryKey: recurringKeys.templates(), queryFn: ({ signal }) => recurringApi.listTemplates(signal) });
}

export function useRecurringTemplate(id: string | undefined) {
  return useQuery({
    queryKey: recurringKeys.template(id ?? ''),
    queryFn: ({ signal }) => recurringApi.getTemplate(id!, signal),
    enabled: Boolean(id),
  });
}

export function useCreateRecurringTemplate() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: RecurringTemplateInput; clientRequestId: string }) => recurringApi.createTemplate(input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useUpdateRecurringTemplate() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecurringTemplateUpdateInput }) => recurringApi.updateTemplate(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteRecurringTemplate() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => recurringApi.deleteTemplate(id), onSuccess: invalidate });
}

/** The confirmation. One month, one transaction; the same key travels with every retry of one press. */
export function useRecordOccurrence() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ templateId, year, month, input, clientRequestId }: { templateId: string; year: number; month: number; input: RecordOccurrenceInput; clientRequestId: string }) =>
      recurringApi.record(templateId, year, month, input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useSkipOccurrence() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ templateId, year, month }: { templateId: string; year: number; month: number }) => recurringApi.skip(templateId, year, month),
    onSuccess: invalidate,
  });
}

export function useUndoOccurrence() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ templateId, year, month }: { templateId: string; year: number; month: number }) => recurringApi.undo(templateId, year, month),
    onSuccess: invalidate,
  });
}
