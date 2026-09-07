import { addAmounts, formatMoney, formatNumber, formatSignedMoney, getDisplayLocale, parseAmount, separatorsFor, setDisplayLocale } from '@/lib/money';
import { isIsoDate, localDateToUtcIso, todayIsoDate } from '@/lib/dates';

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['12,5', 12.5],
    ['12.50', 12.5],
    [' 0,01 ', 0.01],
  ])('parses %p', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.005', '-1', '1,2,3', '12.'])('rejects %p', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('display formatting', () => {
  afterEach(() => setDisplayLocale(null));

  it('uses the Azerbaijani separators by default, with two decimals and the explicit code', () => {
    expect(getDisplayLocale()).toBe('az-AZ');
    expect(formatNumber(1234.5)).toBe('1.234,50');
    expect(formatNumber(-0.5)).toBe('−0,50');
    expect(formatNumber(1234567.891, 0)).toBe('1.234.568');
    expect(formatMoney(1234.5, 'AZN')).toBe('1.234,50 AZN');
    expect(formatMoney(1234.5, 'AZN', { showCode: false })).toBe('1.234,50');
    expect(formatSignedMoney(5, 'USD', 'Income')).toBe('+5,00 USD');
    expect(formatSignedMoney(5, 'USD', 'Expense')).toBe('−5,00 USD');
  });

  it('follows the profile locale once it is known', () => {
    setDisplayLocale('en-US');
    expect(separatorsFor()).toEqual({ decimal: '.', group: ',' });
    expect(formatMoney(1234.5, 'USD')).toBe('1,234.50 USD');
    setDisplayLocale('ru-RU');
    expect(formatNumber(1234.5)).toBe('1\u00A0234,50');
  });

  it('adds two-decimal amounts without floating drift', () => {
    expect(addAmounts(0.1, 0.2)).toBe(0.3);
    expect(addAmounts(1234.56, -1234.56)).toBe(0);
  });
});

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-09-05')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('05.09.2026')).toBe(false);
  });

  it('keeps today at the current time and other days at local noon', () => {
    const now = new Date(2026, 8, 5, 15, 30, 0);
    expect(new Date(localDateToUtcIso(todayIsoDate(now), now)).getTime()).toBe(now.getTime());
    const other = new Date(localDateToUtcIso('2026-09-01', now));
    expect([other.getFullYear(), other.getMonth(), other.getDate(), other.getHours()]).toEqual([2026, 8, 1, 12]);
  });
});
