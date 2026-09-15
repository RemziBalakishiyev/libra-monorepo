import type { Debt, DebtDetail, DebtMovement, DebtSummary } from '@/lib/api/debts';
import type { Transaction } from '@/lib/api/finance';
import type { RecurringMonth, RecurringOccurrence, RecurringTemplate } from '@/lib/api/recurring';

export const rentTemplate: RecurringTemplate = {
  id: 'tpl-rent',
  title: 'Kirayə',
  type: 'Expense',
  amount: 450,
  currencyCode: 'AZN',
  categoryId: 'cat-market',
  categoryName: 'Market',
  accountId: 'acc-cash',
  accountName: 'Nağd',
  dayOfMonth: 31,
  startDate: '2026-01-01',
  endDate: null,
  isActive: true,
  note: null,
  clientRequestId: null,
  createdAtUtc: '2026-01-01T00:00:00Z',
  updatedAtUtc: '2026-01-01T00:00:00Z',
};

export const rentPending: RecurringOccurrence = {
  templateId: 'tpl-rent',
  occurrenceId: null,
  year: 2026,
  month: 9,
  dueDate: '2026-09-30',
  status: 'Pending',
  title: 'Kirayə',
  type: 'Expense',
  amount: 450,
  currencyCode: 'AZN',
  categoryId: 'cat-market',
  categoryName: 'Market',
  accountId: 'acc-cash',
  accountName: 'Nağd',
  transactionId: null,
  recordedAtUtc: null,
  templateIsActive: true,
  updatedAtUtc: null,
};

export const rentTransaction: Transaction = {
  id: 'tx-rent',
  accountId: 'acc-cash',
  accountName: 'Nağd',
  currencyCode: 'AZN',
  categoryId: 'cat-market',
  categoryName: 'Market',
  type: 'Expense',
  amount: 450,
  occurredAtUtc: '2026-09-30T08:00:00Z',
  note: null,
  clientRequestId: null,
  createdAtUtc: '2026-09-15T08:00:00Z',
  updatedAtUtc: '2026-09-15T08:00:00Z',
};

export const rentRecorded: RecurringOccurrence = {
  ...rentPending,
  occurrenceId: 'occ-rent-2026-09',
  status: 'Recorded',
  transactionId: 'tx-rent',
  recordedAtUtc: '2026-09-15T08:00:00Z',
  updatedAtUtc: '2026-09-15T08:00:00Z',
};

export function monthOf(occurrences: RecurringOccurrence[]): RecurringMonth {
  const pending = occurrences.filter((item) => item.status === 'Pending');
  const recorded = occurrences.filter((item) => item.status === 'Recorded');
  const totals = (items: RecurringOccurrence[]) =>
    items.length === 0
      ? []
      : [
          {
            currencyCode: 'AZN',
            income: items.filter((item) => item.type === 'Income').reduce((sum, item) => sum + item.amount, 0),
            expense: items.filter((item) => item.type === 'Expense').reduce((sum, item) => sum + item.amount, 0),
          },
        ];
  return { year: 2026, month: 9, timeZone: 'Asia/Baku', occurrences, pendingTotals: totals(pending), recordedTotals: totals(recorded) };
}

export const receivable: Debt = {
  id: 'debt-ali',
  direction: 'Receivable',
  counterpartyName: 'Əli',
  principal: 300,
  paidAmount: 0,
  remainingAmount: 300,
  currencyCode: 'AZN',
  openedOn: '2026-09-01',
  dueOn: '2026-09-10',
  status: 'Open',
  isOverdue: true,
  movedCashAtOpening: false,
  hasMovements: false,
  note: null,
  clientRequestId: null,
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-09-01T00:00:00Z',
};

export const payable: Debt = {
  ...receivable,
  id: 'debt-bank',
  direction: 'Payable',
  counterpartyName: 'Bank',
  principal: 500,
  remainingAmount: 500,
  dueOn: null,
  isOverdue: false,
};

export const payment100: DebtMovement = {
  id: 'mv-pay-1',
  kind: 'Payment',
  accountId: 'acc-cash',
  accountName: 'Nağd',
  amount: 100,
  cashEffect: 100,
  occurredAtUtc: '2026-09-15T12:00:00Z',
  note: null,
  isReversed: false,
  reversedAtUtc: null,
  createdAtUtc: '2026-09-15T12:00:00Z',
};

export function detailOf(debt: Debt, history: DebtMovement[] = []): DebtDetail {
  return { debt, history };
}

export const summary: DebtSummary = {
  timeZone: 'Asia/Baku',
  today: '2026-09-15',
  currencies: [
    { currencyCode: 'AZN', receivableOutstanding: 300, payableOutstanding: 500, overdueReceivable: 300, overduePayable: 0, openReceivables: 1, openPayables: 1, overdueCount: 1 },
    { currencyCode: 'USD', receivableOutstanding: 40, payableOutstanding: 0, overdueReceivable: 0, overduePayable: 0, openReceivables: 1, openPayables: 0, overdueCount: 0 },
  ],
};

export function pagedDebts(items: Debt[], totalCount = items.length) {
  return { items, pageNumber: 1, pageSize: 50, totalCount, hasNextPage: totalCount > items.length };
}
