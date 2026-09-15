import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const debtDirectionSchema = z.enum(['Receivable', 'Payable']);
export const debtStatusSchema = z.enum(['Open', 'PartiallyPaid', 'Settled']);
export const debtMovementKindSchema = z.enum(['Opening', 'Payment']);

/** One movement of principal through an account. `cashEffect` is signed and zero once reversed. */
export const debtMovementSchema = z.object({
  id: z.string(),
  kind: debtMovementKindSchema,
  accountId: z.string(),
  accountName: z.string(),
  amount: z.number(),
  cashEffect: z.number(),
  occurredAtUtc: z.string(),
  note: z.string().nullable(),
  isReversed: z.boolean(),
  reversedAtUtc: z.string().nullable(),
  createdAtUtc: z.string(),
});

/** Everything derived on the server: remaining = principal − valid payments, status and overdue from that. */
export const debtSchema = z.object({
  id: z.string(),
  direction: debtDirectionSchema,
  counterpartyName: z.string(),
  principal: z.number(),
  paidAmount: z.number(),
  remainingAmount: z.number(),
  currencyCode: z.string(),
  openedOn: z.string(),
  dueOn: z.string().nullable(),
  status: debtStatusSchema,
  isOverdue: z.boolean(),
  movedCashAtOpening: z.boolean(),
  hasMovements: z.boolean(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const debtDetailSchema = z.object({ debt: debtSchema, history: z.array(debtMovementSchema) });

export const debtCurrencySummarySchema = z.object({
  currencyCode: z.string(),
  receivableOutstanding: z.number(),
  payableOutstanding: z.number(),
  overdueReceivable: z.number(),
  overduePayable: z.number(),
  openReceivables: z.number(),
  openPayables: z.number(),
  overdueCount: z.number(),
});

export const debtSummarySchema = z.object({ timeZone: z.string(), today: z.string(), currencies: z.array(debtCurrencySummarySchema) });

const pagedDebtsSchema = z.object({
  items: z.array(debtSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

export type Debt = z.infer<typeof debtSchema>;
export type DebtDetail = z.infer<typeof debtDetailSchema>;
export type DebtMovement = z.infer<typeof debtMovementSchema>;
export type DebtDirection = z.infer<typeof debtDirectionSchema>;
export type DebtStatus = z.infer<typeof debtStatusSchema>;
export type DebtSummary = z.infer<typeof debtSummarySchema>;
export type DebtCurrencySummary = z.infer<typeof debtCurrencySummarySchema>;

/** `accountId` is the explicit choice between "money moves now" and "the obligation already existed". */
export interface DebtInput {
  direction: DebtDirection;
  counterpartyName: string;
  principal: number;
  currencyCode: string;
  openedOn: string;
  dueOn: string | null;
  note: string | null;
  accountId: string | null;
}

export interface DebtUpdateInput {
  counterpartyName: string;
  principal: number;
  openedOn: string;
  dueOn: string | null;
  note: string | null;
  expectedUpdatedAtUtc: string | null;
}

export interface DebtPaymentInput {
  accountId: string;
  amount: number;
  paidOn: string;
  note: string | null;
}

export interface DebtFilters {
  direction?: DebtDirection;
  includeSettled?: boolean;
  currencyCode?: string;
}

const auth = { auth: true } as const;

export const debtsApi = {
  list: (filters: DebtFilters, pageNumber: number, pageSize = 20, signal?: AbortSignal) => {
    const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) });
    if (filters.direction) {
      params.set('direction', filters.direction);
    }
    if (filters.includeSettled) {
      params.set('includeSettled', 'true');
    }
    if (filters.currencyCode) {
      params.set('currencyCode', filters.currencyCode);
    }
    return apiRequest(`/api/finance/debts?${params.toString()}`, { ...auth, schema: pagedDebtsSchema, signal });
  },

  summary: (signal?: AbortSignal) => apiRequest('/api/finance/debts/summary', { ...auth, schema: debtSummarySchema, signal }),

  get: (id: string, signal?: AbortSignal) => apiRequest(`/api/finance/debts/${id}`, { ...auth, schema: debtDetailSchema, signal }),

  create: (input: DebtInput, clientRequestId: string) =>
    apiRequest('/api/finance/debts', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: debtDetailSchema }),

  update: (id: string, input: DebtUpdateInput) => apiRequest(`/api/finance/debts/${id}`, { ...auth, method: 'PUT', body: input, schema: debtDetailSchema }),

  remove: (id: string) => apiRequest(`/api/finance/debts/${id}`, { ...auth, method: 'DELETE' }),

  pay: (id: string, input: DebtPaymentInput, clientRequestId: string) =>
    apiRequest(`/api/finance/debts/${id}/payments`, { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: debtDetailSchema }),

  /** Marks a payment reversed; remaining principal and the account balance move back together. Safe to repeat. */
  undoPayment: (id: string, paymentId: string) =>
    apiRequest(`/api/finance/debts/${id}/payments/${paymentId}/undo`, { ...auth, method: 'POST', body: {}, schema: debtDetailSchema }),
};
