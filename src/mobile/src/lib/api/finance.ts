import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const accountTypeSchema = z.enum(['Cash', 'BankCard', 'BankAccount', 'Savings', 'Other']);
export const categoryKindSchema = z.enum(['Income', 'Expense']);
export const transactionTypeSchema = z.enum(['Income', 'Expense']);

export type AccountType = z.infer<typeof accountTypeSchema>;
export type CategoryKind = z.infer<typeof categoryKindSchema>;
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const accountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  currencyCode: z.string(),
  openingBalance: z.number(),
  currentBalance: z.number(),
  isIncludedInTotal: z.boolean(),
  isArchived: z.boolean(),
  hasActivity: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: categoryKindSchema,
  isSystemDefault: z.boolean(),
  isArchived: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const transactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  currencyCode: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  type: transactionTypeSchema,
  amount: z.number(),
  occurredAtUtc: z.string(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const transferSchema = z.object({
  id: z.string(),
  sourceAccountId: z.string(),
  sourceAccountName: z.string(),
  sourceCurrencyCode: z.string(),
  sourceAmount: z.number(),
  destinationAccountId: z.string(),
  destinationAccountName: z.string(),
  destinationCurrencyCode: z.string(),
  destinationAmount: z.number(),
  effectiveRate: z.number().nullable(),
  occurredAtUtc: z.string(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const budgetSchema = z.object({
  id: z.string(),
  year: z.number(),
  month: z.number(),
  currencyCode: z.string(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  amount: z.number(),
  usedAmount: z.number(),
  remainingAmount: z.number(),
  usagePercent: z.number(),
  isOverBudget: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const budgetSummarySchema = z.object({
  budgetId: z.string(),
  amount: z.number(),
  usedAmount: z.number(),
  remainingAmount: z.number(),
  usagePercent: z.number(),
  isOverBudget: z.boolean(),
});

export const dashboardSchema = z.object({
  currencyCode: z.string(),
  year: z.number(),
  month: z.number(),
  timeZone: z.string(),
  periodStartUtc: z.string(),
  periodEndUtc: z.string(),
  totalBalance: z.number(),
  monthlyIncome: z.number(),
  monthlyExpense: z.number(),
  monthlyNet: z.number(),
  dailyAverageExpense: z.number(),
  daysElapsed: z.number(),
  overallBudget: budgetSummarySchema.nullable(),
  expenseByCategory: z.array(
    z.object({ categoryId: z.string(), categoryName: z.string(), amount: z.number(), percent: z.number() }),
  ),
  recentTransactions: z.array(transactionSchema),
  accounts: z.array(
    z.object({
      accountId: z.string(),
      name: z.string(),
      type: accountTypeSchema,
      currencyCode: z.string(),
      balance: z.number(),
      isIncludedInTotal: z.boolean(),
    }),
  ),
  negativeAccounts: z.array(z.object({ accountId: z.string(), name: z.string(), balance: z.number() })),
  otherCurrencies: z.array(z.object({ currencyCode: z.string(), totalBalance: z.number(), accountCount: z.number() })),
  availableCurrencies: z.array(z.string()),
});

export const setupResponseSchema = z.object({
  isComplete: z.boolean(),
  categoriesCreated: z.number(),
  accountCreated: z.boolean(),
  categories: z.array(categorySchema),
  accounts: z.array(accountSchema),
});

const pagedTransactionsSchema = z.object({
  items: z.array(transactionSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

const pagedTransfersSchema = z.object({
  items: z.array(transferSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Transfer = z.infer<typeof transferSchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type SetupResponse = z.infer<typeof setupResponseSchema>;
export type PagedTransactions = z.infer<typeof pagedTransactionsSchema>;
export type PagedTransfers = z.infer<typeof pagedTransfersSchema>;

export interface AccountInput {
  name: string;
  type: AccountType;
  currencyCode: string;
  openingBalance: number;
  isIncludedInTotal: boolean;
}

export interface AccountUpdateInput extends AccountInput {
  isArchived: boolean;
}

export interface TransactionInput {
  accountId: string;
  categoryId: string;
  type: TransactionType;
  amount: number;
  occurredAtUtc: string;
  note: string | null;
}

export interface TransferInput {
  sourceAccountId: string;
  destinationAccountId: string;
  sourceAmount: number;
  destinationAmount: number;
  occurredAtUtc: string;
  note: string | null;
}

export interface BudgetInput {
  year: number;
  month: number;
  currencyCode: string;
  categoryId: string | null;
  amount: number;
}

export interface TransactionFilters {
  type?: TransactionType;
  accountId?: string;
  categoryId?: string;
  currencyCode?: string;
  from?: string;
  to?: string;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== '');
  if (entries.length === 0) {
    return '';
  }
  return '?' + entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
}

const auth = { auth: true } as const;

export const financeApi = {
  setup: (firstAccount: AccountInput | null) =>
    apiRequest('/api/finance/setup', { ...auth, method: 'POST', body: { firstAccount }, schema: setupResponseSchema }),

  listAccounts: (includeArchived = false, signal?: AbortSignal) =>
    apiRequest(`/api/finance/accounts${query({ includeArchived })}`, { ...auth, schema: z.array(accountSchema), signal }),
  getAccount: (id: string, signal?: AbortSignal) => apiRequest(`/api/finance/accounts/${id}`, { ...auth, schema: accountSchema, signal }),
  createAccount: (input: AccountInput) => apiRequest('/api/finance/accounts', { ...auth, method: 'POST', body: input, schema: accountSchema }),
  updateAccount: (id: string, input: AccountUpdateInput) =>
    apiRequest(`/api/finance/accounts/${id}`, { ...auth, method: 'PUT', body: input, schema: accountSchema }),
  deleteAccount: (id: string) => apiRequest(`/api/finance/accounts/${id}`, { ...auth, method: 'DELETE' }),

  listCategories: (kind?: CategoryKind, includeArchived = false, signal?: AbortSignal) =>
    apiRequest(`/api/finance/categories${query({ kind, includeArchived })}`, { ...auth, schema: z.array(categorySchema), signal }),
  createCategory: (input: { name: string; kind: CategoryKind }) =>
    apiRequest('/api/finance/categories', { ...auth, method: 'POST', body: input, schema: categorySchema }),
  updateCategory: (id: string, input: { name: string; isArchived: boolean }) =>
    apiRequest(`/api/finance/categories/${id}`, { ...auth, method: 'PUT', body: input, schema: categorySchema }),
  deleteCategory: (id: string) => apiRequest(`/api/finance/categories/${id}`, { ...auth, method: 'DELETE' }),

  listTransactions: (filters: TransactionFilters, pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/finance/transactions${query({ ...filters, pageNumber, pageSize })}`, { ...auth, schema: pagedTransactionsSchema, signal }),
  getTransaction: (id: string, signal?: AbortSignal) =>
    apiRequest(`/api/finance/transactions/${id}`, { ...auth, schema: transactionSchema, signal }),
  createTransaction: (input: TransactionInput, clientRequestId: string) =>
    apiRequest('/api/finance/transactions', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: transactionSchema }),
  updateTransaction: (id: string, input: TransactionInput) =>
    apiRequest(`/api/finance/transactions/${id}`, { ...auth, method: 'PUT', body: input, schema: transactionSchema }),
  deleteTransaction: (id: string) => apiRequest(`/api/finance/transactions/${id}`, { ...auth, method: 'DELETE' }),

  listTransfers: (pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/finance/transfers${query({ pageNumber, pageSize })}`, { ...auth, schema: pagedTransfersSchema, signal }),
  getTransfer: (id: string, signal?: AbortSignal) => apiRequest(`/api/finance/transfers/${id}`, { ...auth, schema: transferSchema, signal }),
  createTransfer: (input: TransferInput, clientRequestId: string) =>
    apiRequest('/api/finance/transfers', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: transferSchema }),
  updateTransfer: (id: string, input: TransferInput) =>
    apiRequest(`/api/finance/transfers/${id}`, { ...auth, method: 'PUT', body: input, schema: transferSchema }),
  deleteTransfer: (id: string) => apiRequest(`/api/finance/transfers/${id}`, { ...auth, method: 'DELETE' }),

  listBudgets: (filters: { year?: number; month?: number; currencyCode?: string }, signal?: AbortSignal) =>
    apiRequest(`/api/finance/budgets${query(filters)}`, { ...auth, schema: z.array(budgetSchema), signal }),
  getBudget: (id: string, signal?: AbortSignal) => apiRequest(`/api/finance/budgets/${id}`, { ...auth, schema: budgetSchema, signal }),
  createBudget: (input: BudgetInput) => apiRequest('/api/finance/budgets', { ...auth, method: 'POST', body: input, schema: budgetSchema }),
  updateBudget: (id: string, amount: number) =>
    apiRequest(`/api/finance/budgets/${id}`, { ...auth, method: 'PUT', body: { amount }, schema: budgetSchema }),
  deleteBudget: (id: string) => apiRequest(`/api/finance/budgets/${id}`, { ...auth, method: 'DELETE' }),

  dashboard: (params: { currencyCode?: string; year?: number; month?: number }, signal?: AbortSignal) =>
    apiRequest(`/api/finance/dashboard${query(params)}`, { ...auth, schema: dashboardSchema, signal }),
};
