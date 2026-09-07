import { calendarDayIn, daysInMonth } from '@/lib/dates';

export interface DatedExpense {
  amount: number;
  occurredAtUtc: string;
  type: 'Income' | 'Expense';
  currencyCode: string;
}

/**
 * Expense per calendar day of a month (index 0 = day 1), bucketed in the user's time zone (the one the API used
 * for the monthly totals). Only expenses in the dashboard currency count, transfers are never in the input, and
 * sums are done in cents so 0.1 + 0.2 stays 0.30.
 */
export function dailyExpenseSeries(items: readonly DatedExpense[], year: number, month: number, currencyCode: string, timeZone?: string): number[] {
  const cents = Array.from({ length: daysInMonth(year, month) }, () => 0);
  for (const item of items) {
    if (item.type !== 'Expense' || item.currencyCode !== currencyCode) {
      continue;
    }
    const day = calendarDayIn(item.occurredAtUtc, timeZone);
    if (day.year !== year || day.month !== month) {
      continue;
    }
    cents[day.day - 1] = cents[day.day - 1]! + Math.round(item.amount * 100);
  }
  return cents.map((value) => value / 100);
}

export interface RecentDay {
  day: number;
  amount: number;
  isToday: boolean;
}

/** The last `count` elapsed days of the month, oldest first, for the compact daily view. */
export function recentDays(series: readonly number[], daysElapsed: number, count = 7): RecentDay[] {
  const end = Math.max(0, Math.min(daysElapsed, series.length));
  const start = Math.max(0, end - count);
  const days: RecentDay[] = [];
  for (let index = start; index < end; index += 1) {
    days.push({ day: index + 1, amount: series[index] ?? 0, isToday: index === end - 1 });
  }
  return days;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  hasNextPage: boolean;
}

export type PageFetcher<T> = (pageNumber: number, pageSize: number) => Promise<PagedResult<T>>;

/** Thrown when the API reports more rows than were received, so a partial sum is never shown as complete. */
export class IncompleteDataError extends Error {
  constructor(received: number, expected: number) {
    super(`Received ${received} of ${expected} rows`);
    this.name = 'IncompleteDataError';
  }
}

/** Upper bound the API accepts for `pageSize`. */
export const MAX_PAGE_SIZE = 100;

/**
 * Loads every page of a filtered list (the API caps a page at 100 rows). Stops as soon as the scope changes
 * (`signal` aborted) and rejects when any page fails or the total does not add up, so callers either get the
 * complete set or an error — never a truncated first page.
 */
export async function fetchAllPages<T>(fetchPage: PageFetcher<T>, signal?: AbortSignal, pageSize = MAX_PAGE_SIZE): Promise<{ items: T[]; totalCount: number; pages: number }> {
  const items: T[] = [];
  let pageNumber = 1;
  let totalCount = 0;
  for (;;) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const page = await fetchPage(pageNumber, pageSize);
    items.push(...page.items);
    totalCount = page.totalCount;
    if (!page.hasNextPage) {
      break;
    }
    pageNumber += 1;
  }
  if (items.length < totalCount) {
    throw new IncompleteDataError(items.length, totalCount);
  }
  return { items, totalCount, pages: pageNumber };
}

export interface BudgetImpact {
  /** Budget being consumed: the category budget when one exists, otherwise the overall budget. */
  scope: 'category' | 'overall';
  title: string;
  remainingBefore: number;
  remainingAfter: number;
  percentAfter: number;
  exceeds: boolean;
}

export interface BudgetLike {
  amount: number;
  usedAmount: number;
}

/**
 * The transaction being edited, so its current contribution is removed before the proposed value is applied.
 * `sameMonth` — the original sits in the budget month; `sameCategory` — it sits in the category whose budget
 * is being compared.
 */
export interface OriginalContribution {
  amount: number;
  sameMonth: boolean;
  sameCategory: boolean;
}

const cents = (value: number) => Math.round(value * 100);

/** Remaining budget after a prospective expense. Returns null when there is nothing to compare against. */
export function budgetImpact(amount: number, categoryName: string | null, categoryBudget: BudgetLike | null, overallBudget: BudgetLike | null, original?: OriginalContribution): BudgetImpact | null {
  const budget = categoryBudget ?? overallBudget;
  if (!budget || budget.amount <= 0 || amount <= 0) {
    return null;
  }
  const scope = categoryBudget ? 'category' : 'overall';
  const removed = original && original.sameMonth && (scope === 'overall' || original.sameCategory) ? cents(original.amount) : 0;
  const usedBefore = Math.max(0, cents(budget.usedAmount) - removed);
  const limit = cents(budget.amount);
  const remainingBefore = limit - usedBefore;
  const remainingAfter = remainingBefore - cents(amount);
  return {
    scope,
    title: categoryBudget && categoryName ? `${categoryName} büdcəsi` : 'Ümumi büdcə',
    remainingBefore: remainingBefore / 100,
    remainingAfter: remainingAfter / 100,
    percentAfter: Math.round(((usedBefore + cents(amount)) / limit) * 1000) / 10,
    exceeds: remainingAfter < 0,
  };
}

export interface BudgetPace {
  /** Share of the month elapsed, in percent. */
  expectedPercent: number;
  /** Usage minus expected usage (positive = spending faster than the calendar). */
  aheadByPercent: number;
  /** True when usage runs more than 10 points ahead of the elapsed share of the month. */
  fast: boolean;
}

/**
 * Spending pace versus the calendar: `usagePercent` of the limit against `daysElapsed / daysInMonth`. This is a
 * comparison, not a forecast; callers label it that way.
 */
export function budgetPace(usagePercent: number, daysElapsed: number, daysInMonth: number): BudgetPace | null {
  if (daysInMonth <= 0 || daysElapsed <= 0) {
    return null;
  }
  const expectedPercent = Math.round((Math.min(daysElapsed, daysInMonth) / daysInMonth) * 1000) / 10;
  const aheadByPercent = Math.round((usagePercent - expectedPercent) * 10) / 10;
  return { expectedPercent, aheadByPercent, fast: aheadByPercent > 10 };
}
