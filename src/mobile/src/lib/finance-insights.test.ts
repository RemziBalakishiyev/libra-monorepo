import { sanitizeAmount } from '@/components/amount-input';
import { buildInsights, compactAmount, projectMonthEnd } from '@/components/insight-card';
import { withAlpha } from '@/lib/color';
import { calendarDayIn, formatLongDate, formatRelativeDay, formatShortDate, formatWeekdayDate } from '@/lib/dates';
import { IncompleteDataError, budgetImpact, budgetPace, dailyExpenseSeries, fetchAllPages, recentDays, type PagedResult } from '@/lib/finance-insights';

describe('dailyExpenseSeries', () => {
  it('sums expenses per day in the dashboard currency only, in cents', () => {
    const series = dailyExpenseSeries(
      [
        { amount: 0.1, occurredAtUtc: new Date(2026, 8, 2, 9).toISOString(), type: 'Expense', currencyCode: 'AZN' },
        { amount: 0.2, occurredAtUtc: new Date(2026, 8, 2, 20).toISOString(), type: 'Expense', currencyCode: 'AZN' },
        { amount: 99, occurredAtUtc: new Date(2026, 8, 3, 9).toISOString(), type: 'Income', currencyCode: 'AZN' },
        { amount: 7, occurredAtUtc: new Date(2026, 8, 4, 9).toISOString(), type: 'Expense', currencyCode: 'USD' },
        { amount: 1, occurredAtUtc: new Date(2026, 7, 31, 9).toISOString(), type: 'Expense', currencyCode: 'AZN' },
      ],
      2026,
      9,
      'AZN',
    );

    expect(series).toHaveLength(30);
    expect(series[1]).toBe(0.3);
    expect(series[2]).toBe(0);
    expect(series[3]).toBe(0);
    expect(series.reduce((sum, value) => sum + value, 0)).toBe(0.3);
  });

  it('buckets by the profile time zone, not the device zone', () => {
    // 21:30 UTC on 1 September is already 2 September in Baku (UTC+4).
    const series = dailyExpenseSeries([{ amount: 5, occurredAtUtc: '2026-09-01T21:30:00Z', type: 'Expense', currencyCode: 'AZN' }], 2026, 9, 'AZN', 'Asia/Baku');
    expect(series[1]).toBe(5);
    expect(series[0]).toBe(0);
    expect(calendarDayIn('2026-09-01T21:30:00Z', 'Asia/Baku')).toEqual({ year: 2026, month: 9, day: 2 });
    expect(calendarDayIn('2026-09-01T21:30:00Z', 'UTC')).toEqual({ year: 2026, month: 9, day: 1 });
  });

  it('returns the last seven elapsed days with today last', () => {
    const series = Array.from({ length: 30 }, (_, index) => index + 1);
    const days = recentDays(series, 10, 7);
    expect(days.map((day) => day.day)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(days[6]).toEqual({ day: 10, amount: 10, isToday: true });
    expect(recentDays(series, 2, 7)).toHaveLength(2);
  });
});

describe('fetchAllPages', () => {
  const page = (items: number[], totalCount: number, hasNextPage: boolean): PagedResult<number> => ({ items, totalCount, hasNextPage });

  it('assembles every page so an expense beyond the first 100 rows is included', async () => {
    const all = Array.from({ length: 205 }, (_, index) => (index === 180 ? 999 : 1));
    const fetchPage = jest.fn(async (pageNumber: number, pageSize: number) => {
      const start = (pageNumber - 1) * pageSize;
      const items = all.slice(start, start + pageSize);
      return page(items, all.length, start + pageSize < all.length);
    });

    const result = await fetchAllPages(fetchPage);

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenLastCalledWith(3, 100);
    expect(result.totalCount).toBe(205);
    expect(result.items).toHaveLength(205);
    expect(result.items.reduce((sum, value) => sum + value, 0)).toBe(204 + 999);
  });

  it('rejects instead of returning a partial set when a later page fails', async () => {
    const fetchPage = jest.fn(async (pageNumber: number) => {
      if (pageNumber === 2) {
        throw new TypeError('Network request failed');
      }
      return page(Array.from({ length: 100 }, () => 1), 150, true);
    });

    await expect(fetchAllPages(fetchPage)).rejects.toThrow('Network request failed');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('rejects when the total does not add up', async () => {
    const fetchPage = jest.fn(async () => page([1, 2, 3], 10, false));
    await expect(fetchAllPages(fetchPage)).rejects.toBeInstanceOf(IncompleteDataError);
  });

  it('stops between pages when the scope changes (signal aborted)', async () => {
    const controller = new AbortController();
    const fetchPage = jest.fn(async (pageNumber: number) => {
      controller.abort();
      return page(Array.from({ length: 100 }, () => pageNumber), 300, true);
    });

    await expect(fetchAllPages(fetchPage, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});

describe('budgetImpact', () => {
  it('prefers the category budget and flags an overrun without blocking', () => {
    const impact = budgetImpact(25, 'Market', { amount: 60, usedAmount: 49.5 }, { amount: 1000, usedAmount: 100 });
    expect(impact).toEqual({ scope: 'category', title: 'Market büdcəsi', remainingBefore: 10.5, remainingAfter: -14.5, percentAfter: 124.2, exceeds: true });
  });

  it('falls back to the overall budget and returns null without one', () => {
    expect(budgetImpact(25, 'Market', null, { amount: 1000, usedAmount: 100 })?.title).toBe('Ümumi büdcə');
    expect(budgetImpact(25, 'Market', null, null)).toBeNull();
    expect(budgetImpact(0, 'Market', null, { amount: 1000, usedAmount: 100 })).toBeNull();
  });

  it('removes the original contribution when editing in the same category and month', () => {
    const impact = budgetImpact(30, 'Market', { amount: 60, usedAmount: 49.5 }, null, { amount: 20, sameMonth: true, sameCategory: true });
    // used becomes 29.5, remaining 30.5, after the new 30 → 0.5 left
    expect(impact).toMatchObject({ remainingBefore: 30.5, remainingAfter: 0.5, exceeds: false, percentAfter: 99.2 });
  });

  it('keeps the category budget untouched when the category changed, but still credits the overall budget', () => {
    const changedCategory = { amount: 20, sameMonth: true, sameCategory: false };
    const category = budgetImpact(30, 'Restoran', { amount: 60, usedAmount: 10 }, { amount: 1000, usedAmount: 100 }, changedCategory);
    expect(category).toMatchObject({ scope: 'category', remainingBefore: 50, remainingAfter: 20 });
    const overall = budgetImpact(30, 'Restoran', null, { amount: 1000, usedAmount: 100 }, changedCategory);
    expect(overall).toMatchObject({ scope: 'overall', remainingBefore: 920, remainingAfter: 890 });
  });

  it('does not credit anything when the original sits in another month', () => {
    const impact = budgetImpact(30, 'Market', { amount: 60, usedAmount: 49.5 }, null, { amount: 20, sameMonth: false, sameCategory: true });
    expect(impact).toMatchObject({ remainingBefore: 10.5, remainingAfter: -19.5, exceeds: true });
  });
});

describe('budgetPace', () => {
  it('compares usage with the elapsed share of the month', () => {
    expect(budgetPace(58, 7, 30)).toEqual({ expectedPercent: 23.3, aheadByPercent: 34.7, fast: true });
    expect(budgetPace(20, 7, 30)?.fast).toBe(false);
    expect(budgetPace(20, 0, 30)).toBeNull();
    expect(budgetPace(20, 31, 30)?.expectedPercent).toBe(100);
  });
});

describe('buildInsights', () => {
  const base = { currencyCode: 'AZN', year: 2026, month: 9, monthlyExpense: 300, dailyAverageExpense: 30, daysElapsed: 10, daysInMonth: 30, dailyExpenses: Array.from({ length: 30 }, () => 0), topCategory: { categoryName: 'Ev', percent: 60 } };

  it('separates limit usage from pace and labels the projection as an estimate', () => {
    const insights = buildInsights({ ...base, budget: { amount: 600, usedAmount: 300, usagePercent: 50 } });
    expect(insights.map((insight) => insight.kind)).toEqual(['limit', 'pace', 'estimate', 'share']);
    expect(insights[0]?.text).toContain('Büdcənin 50%-i istifadə olunub');
    expect(insights[1]?.text).toContain('Temp: ayın 33%-i keçib');
    expect(insights[1]?.text).toContain('öndə');
    expect(insights[2]?.text).toBe('Bu orta davam etsə, ay sonu xərc təxminən 900,00 AZN olar.');
  });

  it('leads with the largest category without a budget', () => {
    const insights = buildInsights({ ...base, budget: null });
    expect(insights[0]).toMatchObject({ kind: 'share', text: 'Ev bu ayın xərclərinin 60%-ni təşkil edir.' });
  });

  it('projects the month end from the unrounded total, not the rounded daily average', () => {
    // 693.59 over 7 of 30 days: 693.59 / 7 × 30 = 2972.5285… → 2972.53 (the rounded average 99.08 × 23 + 693.59 would give 2972.43).
    expect(projectMonthEnd(693.59, 7, 30)).toBe(2972.53);
    expect(projectMonthEnd(0.1, 1, 30)).toBe(3);
    expect(projectMonthEnd(50, 0, 30)).toBe(50);
    const insights = buildInsights({ ...base, monthlyExpense: 693.59, dailyAverageExpense: 99.08, daysElapsed: 7, daysInMonth: 30, budget: null, topCategory: null });
    expect(insights.find((insight) => insight.kind === 'estimate')?.text).toBe('Bu orta davam etsə, ay sonu xərc təxminən 2.972,53 AZN olar.');
  });

  it('shortens column labels but never the accessible value', () => {
    expect(compactAmount(13.4)).toBe('13,4');
    expect(compactAmount(450)).toBe('450');
    expect(compactAmount(1234.56)).toBe('1.235');
    expect(compactAmount(0)).toBe('0');
  });
});

describe('date formatting', () => {
  it('renders localised long, short and relative dates', () => {
    expect(formatLongDate('2026-09-06')).toBe('6 sentyabr 2026');
    expect(formatShortDate(new Date(2026, 8, 6, 12).toISOString(), new Date(2026, 8, 6))).toBe('6 sen');
    expect(formatShortDate(new Date(2025, 0, 6, 12).toISOString(), new Date(2026, 8, 6))).toBe('6 yan 2025');
    expect(formatRelativeDay(new Date(2026, 8, 6, 12).toISOString(), new Date(2026, 8, 6, 15))).toBe('Bu gün');
    expect(formatRelativeDay(new Date(2026, 8, 5, 12).toISOString(), new Date(2026, 8, 6, 15))).toBe('Dünən');
    expect(formatWeekdayDate(new Date(2026, 8, 6))).toBe('Bazar, 6 sentyabr');
  });
});

describe('sanitizeAmount', () => {
  it('keeps digits and a single separator without moving the caret', () => {
    expect(sanitizeAmount('12,50')).toBe('12,50');
    expect(sanitizeAmount('1a2.5')).toBe('12.5');
    expect(sanitizeAmount('1,2,3')).toBe('1,23');
    expect(sanitizeAmount('1.005')).toBe('1.005');
    expect(sanitizeAmount('12345678901234567')).toBe('1234567890123');
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba and leaves other values untouched', () => {
    expect(withAlpha('#4F5FE7', 0.12)).toBe('rgba(79, 95, 231, 0.12)');
    expect(withAlpha('rgba(0,0,0,0.5)', 0.2)).toBe('rgba(0,0,0,0.5)');
  });
});
