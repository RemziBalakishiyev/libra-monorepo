/**
 * Money helpers. Amounts travel as JSON numbers with at most two decimals. Parsing (what the user types) and
 * display formatting (what the user reads) are separate: input accepts either decimal separator, display follows
 * the profile locale through one shared formatter so dashboard figures and form values agree.
 */

const AMOUNT_PATTERN = /^\d{1,13}([.,]\d{1,2})?$/;

/** Parses user input such as "12,50" or "12.5". Returns null when it is not a valid two-decimal amount. */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!AMOUNT_PATTERN.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/**
 * Parses a positive decimal the user typed, with either separator: "12,5", "0.75", "150".
 * `maxFractionDigits` is the precision the field accepts; returns null when the text is not such a number.
 * Used for nutrition quantities (three decimals) and nutrient values (two).
 */
export function parseDecimalInput(input: string, maxFractionDigits = 2): number | null {
  const trimmed = input.trim();
  if (!new RegExp('^\\d{1,9}([.,]\\d{1,' + maxFractionDigits + '})?$').test(trimmed)) {
    return null;
  }
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** maxFractionDigits;
  return Math.round(value * factor) / factor;
}

export interface NumberSeparators {
  decimal: string;
  group: string;
}

/**
 * Separators per language. Browser and Hermes ICU data for az-AZ is incomplete (it falls back to English
 * grouping), so the common locales are pinned here and Intl is only consulted for unknown ones.
 */
const knownSeparators: Record<string, NumberSeparators> = {
  az: { decimal: ',', group: '.' },
  tr: { decimal: ',', group: '.' },
  ru: { decimal: ',', group: '\u00A0' },
  de: { decimal: ',', group: '.' },
  en: { decimal: '.', group: ',' },
};

/** The interface language. Every number on screen follows its separators ("5.000,00"), on native and on web. */
export const UI_LOCALE = 'az-AZ';
const DEFAULT_LOCALE = UI_LOCALE;
let displayLocale = DEFAULT_LOCALE;

/** Locale used by every display formatter. The app sets it to `UI_LOCALE`; tests may pin another. */
export function setDisplayLocale(locale: string | null | undefined): void {
  displayLocale = locale && locale.trim() !== '' ? locale : DEFAULT_LOCALE;
}

export function getDisplayLocale(): string {
  return displayLocale;
}

export function separatorsFor(locale: string = displayLocale): NumberSeparators {
  const language = locale.split(/[-_]/)[0]?.toLowerCase() ?? '';
  const known = knownSeparators[language];
  if (known) {
    return known;
  }
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234.5);
    const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.';
    const group = parts.find((part) => part.type === 'group')?.value ?? ',';
    return { decimal, group };
  } catch {
    return knownSeparators.az!;
  }
}

/** Fixed-decimal number with locale separators: 1234.5 → "1.234,50" (az), "1,234.50" (en). */
export function formatNumber(amount: number, fractionDigits = 2, locale: string = displayLocale): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }
  const { decimal, group } = separatorsFor(locale);
  const rounded = Math.round(Math.abs(amount) * 10 ** fractionDigits) / 10 ** fractionDigits;
  const [whole, fraction = ''] = rounded.toFixed(fractionDigits).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const negative = amount < 0 && rounded !== 0;
  return `${negative ? '−' : ''}${grouped}${fractionDigits > 0 ? `${decimal}${fraction}` : ''}`;
}

export interface FormatMoneyOptions {
  showCode?: boolean;
  locale?: string;
}

/** "1.234,56 AZN": digit grouping from the display locale, explicit ISO code after the number. */
export function formatMoney(amount: number, currencyCode: string, options: FormatMoneyOptions | string = {}): string {
  const resolved = typeof options === 'string' ? { locale: options } : options;
  const number = formatNumber(amount, 2, resolved.locale);
  return resolved.showCode === false ? number : `${number} ${currencyCode}`;
}

/** Signed variant for lists: "+12,00 AZN" for income, "−12,00 AZN" for expense. */
export function formatSignedMoney(amount: number, currencyCode: string, type: 'Income' | 'Expense', locale?: string): string {
  const sign = type === 'Income' ? '+' : '−';
  return `${sign}${formatMoney(Math.abs(amount), currencyCode, { locale })}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** Adds two-decimal amounts without floating drift (cents arithmetic). */
export function addAmounts(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100;
}
