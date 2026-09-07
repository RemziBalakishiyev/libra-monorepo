import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  financeApi,
  type AccountInput,
  type AccountUpdateInput,
  type BudgetInput,
  type CategoryKind,
  type Transaction,
  type TransactionFilters,
  type TransactionInput,
  type TransferInput,
} from '@/lib/api/finance';
import { fetchAllPages } from '@/lib/finance-insights';

export const financeKeys = {
  all: ['finance'] as const,
  accounts: (includeArchived: boolean) => ['finance', 'accounts', { includeArchived }] as const,
  account: (id: string) => ['finance', 'accounts', 'item', id] as const,
  categories: (kind: CategoryKind | undefined, includeArchived: boolean) => ['finance', 'categories', { kind, includeArchived }] as const,
  transactions: (filters: TransactionFilters) => ['finance', 'transactions', filters] as const,
  transaction: (id: string) => ['finance', 'transactions', 'item', id] as const,
  transfers: () => ['finance', 'transfers'] as const,
  transfer: (id: string) => ['finance', 'transfers', 'item', id] as const,
  budgets: (filters: { year?: number; month?: number; currencyCode?: string }) => ['finance', 'budgets', filters] as const,
  budget: (id: string) => ['finance', 'budgets', 'item', id] as const,
  dashboard: (params: { currencyCode?: string; year?: number; month?: number }) => ['finance', 'dashboard', params] as const,
};

/** Any finance mutation changes balances, budgets, and the dashboard, so everything under 'finance' is refetched. */
function useInvalidateFinance() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: financeKeys.all });
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: financeKeys.accounts(includeArchived),
    queryFn: ({ signal }) => financeApi.listAccounts(includeArchived, signal),
  });
}

export function useAccount(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.account(id ?? ''),
    queryFn: ({ signal }) => financeApi.getAccount(id!, signal),
    enabled: Boolean(id),
  });
}

export function useCategories(kind?: CategoryKind, includeArchived = false) {
  return useQuery({
    queryKey: financeKeys.categories(kind, includeArchived),
    queryFn: ({ signal }) => financeApi.listCategories(kind, includeArchived, signal),
  });
}

export function useTransactions(filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: financeKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) => financeApi.listTransactions(filters, pageParam, 20, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.pageNumber + 1 : undefined),
  });
}

export interface MonthExpensesParams {
  currencyCode: string;
  from: string;
  to: string;
}

export interface MonthExpenses {
  items: Transaction[];
  totalCount: number;
  /** Pages fetched to assemble the complete set (diagnostics). */
  pages: number;
}

/** Complete month of expenses; rejects (instead of truncating) when a later page fails or the total does not match. */
export function fetchMonthExpenses(params: MonthExpensesParams, signal?: AbortSignal): Promise<MonthExpenses> {
  return fetchAllPages((pageNumber, pageSize) => financeApi.listTransactions({ type: 'Expense', currencyCode: params.currencyCode, from: params.from, to: params.to }, pageNumber, pageSize, signal), signal);
}

/**
 * Every expense of the dashboard month in the dashboard currency, for the daily spending series. Reads all pages
 * (the API caps a page at 100 rows), is keyed by currency and period so a scope change starts a new query and
 * aborts the old one, and errors instead of returning a partial set.
 */
export function useMonthExpenses(params: MonthExpensesParams | undefined) {
  return useQuery({
    queryKey: ['finance', 'transactions', 'month', params] as const,
    queryFn: ({ signal }) => fetchMonthExpenses(params!, signal),
    enabled: Boolean(params),
    retry: 1,
  });
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transaction(id ?? ''),
    queryFn: ({ signal }) => financeApi.getTransaction(id!, signal),
    enabled: Boolean(id),
  });
}

export function useTransfers() {
  return useInfiniteQuery({
    queryKey: financeKeys.transfers(),
    queryFn: ({ pageParam, signal }) => financeApi.listTransfers(pageParam, 20, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.pageNumber + 1 : undefined),
  });
}

export function useTransfer(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transfer(id ?? ''),
    queryFn: ({ signal }) => financeApi.getTransfer(id!, signal),
    enabled: Boolean(id),
  });
}

export function useBudgets(filters: { year?: number; month?: number; currencyCode?: string } = {}) {
  return useQuery({
    queryKey: financeKeys.budgets(filters),
    queryFn: ({ signal }) => financeApi.listBudgets(filters, signal),
  });
}

export function useBudget(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.budget(id ?? ''),
    queryFn: ({ signal }) => financeApi.getBudget(id!, signal),
    enabled: Boolean(id),
  });
}

export function useDashboard(params: { currencyCode?: string; year?: number; month?: number } = {}) {
  return useQuery({
    queryKey: financeKeys.dashboard(params),
    queryFn: ({ signal }) => financeApi.dashboard(params, signal),
  });
}

export function useFinanceSetup() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (firstAccount: AccountInput | null) => financeApi.setup(firstAccount), onSuccess: invalidate });
}

export function useCreateAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (input: AccountInput) => financeApi.createAccount(input), onSuccess: invalidate });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AccountUpdateInput }) => financeApi.updateAccount(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => financeApi.deleteAccount(id), onSuccess: invalidate });
}

export function useCreateCategory() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (input: { name: string; kind: CategoryKind }) => financeApi.createCategory(input), onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name: string; isArchived: boolean } }) => financeApi.updateCategory(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => financeApi.deleteCategory(id), onSuccess: invalidate });
}

export function useCreateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: TransactionInput; clientRequestId: string }) =>
      financeApi.createTransaction(input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransactionInput }) => financeApi.updateTransaction(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => financeApi.deleteTransaction(id), onSuccess: invalidate });
}

export function useCreateTransfer() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: TransferInput; clientRequestId: string }) =>
      financeApi.createTransfer(input, clientRequestId),
    onSuccess: invalidate,
  });
}

export function useUpdateTransfer() {
  const invalidate = useInvalidateFinance();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TransferInput }) => financeApi.updateTransfer(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteTransfer() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => financeApi.deleteTransfer(id), onSuccess: invalidate });
}

export function useCreateBudget() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (input: BudgetInput) => financeApi.createBudget(input), onSuccess: invalidate });
}

export function useUpdateBudget() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: ({ id, amount }: { id: string; amount: number }) => financeApi.updateBudget(id, amount), onSuccess: invalidate });
}

export function useDeleteBudget() {
  const invalidate = useInvalidateFinance();
  return useMutation({ mutationFn: (id: string) => financeApi.deleteBudget(id), onSuccess: invalidate });
}
