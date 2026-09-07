import type { Account, Category, Dashboard } from '@/lib/api/finance';

export const cashAccount: Account = {
  id: 'acc-cash',
  name: 'Nağd',
  type: 'Cash',
  currencyCode: 'AZN',
  openingBalance: 100,
  currentBalance: 250.5,
  isIncludedInTotal: true,
  isArchived: false,
  hasActivity: true,
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-09-01T00:00:00Z',
};

export const usdAccount: Account = {
  ...cashAccount,
  id: 'acc-usd',
  name: 'USD kart',
  type: 'BankCard',
  currencyCode: 'USD',
  openingBalance: 0,
  currentBalance: 40,
  hasActivity: false,
};

export const categories: Category[] = [
  { id: 'cat-salary', name: 'Maaş', kind: 'Income', isSystemDefault: true, isArchived: false, createdAtUtc: '2026-09-01T00:00:00Z', updatedAtUtc: '2026-09-01T00:00:00Z' },
  { id: 'cat-market', name: 'Market', kind: 'Expense', isSystemDefault: true, isArchived: false, createdAtUtc: '2026-09-01T00:00:00Z', updatedAtUtc: '2026-09-01T00:00:00Z' },
];

export const dashboard: Dashboard = {
  currencyCode: 'AZN',
  year: 2026,
  month: 9,
  timeZone: 'Asia/Baku',
  periodStartUtc: '2026-08-31T20:00:00Z',
  periodEndUtc: '2026-09-30T20:00:00Z',
  totalBalance: 250.5,
  monthlyIncome: 300,
  monthlyExpense: 49.5,
  monthlyNet: 250.5,
  dailyAverageExpense: 9.9,
  daysElapsed: 5,
  overallBudget: { budgetId: 'bud-1', amount: 200, usedAmount: 49.5, remainingAmount: 150.5, usagePercent: 24.8, isOverBudget: false },
  expenseByCategory: [{ categoryId: 'cat-market', categoryName: 'Market', amount: 49.5, percent: 100 }],
  recentTransactions: [
    {
      id: 'tx-1',
      accountId: 'acc-cash',
      accountName: 'Nağd',
      currencyCode: 'AZN',
      categoryId: 'cat-market',
      categoryName: 'Market',
      type: 'Expense',
      amount: 49.5,
      occurredAtUtc: '2026-09-05T08:00:00Z',
      note: null,
      clientRequestId: null,
      createdAtUtc: '2026-09-05T08:00:00Z',
      updatedAtUtc: '2026-09-05T08:00:00Z',
    },
  ],
  accounts: [{ accountId: 'acc-cash', name: 'Nağd', type: 'Cash', currencyCode: 'AZN', balance: 250.5, isIncludedInTotal: true }],
  negativeAccounts: [],
  otherCurrencies: [{ currencyCode: 'USD', totalBalance: 40, accountCount: 1 }],
  availableCurrencies: ['AZN', 'USD'],
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

/** Routes mocked fetch calls by URL path so a screen can load several resources at once. */
export function fetchByPath(routes: Record<string, () => Response>): (input: RequestInfo | URL) => Promise<Response> {
  return async (input) => {
    const url = new URL(String(input));
    const key = Object.keys(routes).find((path) => url.pathname === path);
    if (!key) {
      throw new TypeError(`No mock for ${url.pathname}`);
    }
    return routes[key]!();
  };
}
