import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { financeKeys } from '@/hooks/use-finance';
import { debtsApi, type DebtFilters, type DebtInput, type DebtPaymentInput, type DebtUpdateInput } from '@/lib/api/debts';

/**
 * Under 'finance': a payment moves an account balance, and lending or borrowing at creation does too, so the
 * accounts, dashboard and Home all have to refresh after any of these — the module-wide invalidation does that.
 */
export const debtKeys = {
  all: ['finance', 'debts'] as const,
  list: (filters: DebtFilters) => ['finance', 'debts', 'list', filters] as const,
  summary: () => ['finance', 'debts', 'summary'] as const,
  detail: (id: string) => ['finance', 'debts', 'item', id] as const,
};

function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
}

export function useDebts(filters: DebtFilters, pageSize = 50) {
  return useQuery({
    queryKey: debtKeys.list(filters),
    queryFn: ({ signal }) => debtsApi.list(filters, 1, pageSize, signal),
  });
}

/** Per-currency outstanding and overdue totals over every debt, computed by the server, never over a page. */
export function useDebtSummary() {
  return useQuery({ queryKey: debtKeys.summary(), queryFn: ({ signal }) => debtsApi.summary(signal) });
}

export function useDebt(id: string | undefined) {
  return useQuery({
    queryKey: debtKeys.detail(id ?? ''),
    queryFn: ({ signal }) => debtsApi.get(id!, signal),
    enabled: Boolean(id),
  });
}

export function useCreateDebt() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: DebtInput; clientRequestId: string }) => debtsApi.create(input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useUpdateDebt() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DebtUpdateInput }) => debtsApi.update(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteDebt() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => debtsApi.remove(id), onSuccess: invalidate });
}

/** A payment. The same key travels with every retry of one press, so a lost answer cannot pay twice. */
export function useRecordDebtPayment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input, clientRequestId }: { id: string; input: DebtPaymentInput; clientRequestId: string }) => debtsApi.pay(id, input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useUndoDebtPayment() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, paymentId }: { id: string; paymentId: string }) => debtsApi.undoPayment(id, paymentId),
    onSuccess: invalidate,
  });
}
