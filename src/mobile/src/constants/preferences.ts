/**
 * Readable options for the profile preferences. Values stay the exact codes the API validates (BCP 47 locale,
 * ISO 4217 currency, IANA time zone); only the labels are human. An existing value outside these lists is kept
 * and shown as-is so saving never silently changes it.
 */

export interface PreferenceOption {
  value: string;
  label: string;
  hint?: string;
}

export const localeOptions: readonly PreferenceOption[] = [
  { value: 'az-AZ', label: 'Azərbaycan dili', hint: 'az-AZ' },
  { value: 'en-US', label: 'English', hint: 'en-US' },
  { value: 'ru-RU', label: 'Русский', hint: 'ru-RU' },
  { value: 'tr-TR', label: 'Türkçe', hint: 'tr-TR' },
];

export const currencyOptions: readonly PreferenceOption[] = [
  { value: 'AZN', label: 'Azərbaycan manatı (AZN)' },
  { value: 'USD', label: 'ABŞ dolları (USD)' },
  { value: 'EUR', label: 'Avro (EUR)' },
  { value: 'GBP', label: 'Funt sterlinq (GBP)' },
  { value: 'TRY', label: 'Türk lirəsi (TRY)' },
  { value: 'RUB', label: 'Rusiya rublu (RUB)' },
  { value: 'GEL', label: 'Gürcü larisi (GEL)' },
  { value: 'AED', label: 'BƏƏ dirhəmi (AED)' },
];

export const timeZoneOptions: readonly PreferenceOption[] = [
  { value: 'Asia/Baku', label: 'Bakı (UTC+4)', hint: 'Asia/Baku' },
  { value: 'Asia/Tbilisi', label: 'Tbilisi (UTC+4)', hint: 'Asia/Tbilisi' },
  { value: 'Europe/Istanbul', label: 'İstanbul (UTC+3)', hint: 'Europe/Istanbul' },
  { value: 'Europe/Moscow', label: 'Moskva (UTC+3)', hint: 'Europe/Moscow' },
  { value: 'Asia/Dubai', label: 'Dubay (UTC+4)', hint: 'Asia/Dubai' },
  { value: 'Europe/Berlin', label: 'Berlin (UTC+1/+2)', hint: 'Europe/Berlin' },
  { value: 'Europe/London', label: 'London (UTC+0/+1)', hint: 'Europe/London' },
  { value: 'America/New_York', label: 'Nyu-York (UTC−5/−4)', hint: 'America/New_York' },
  { value: 'UTC', label: 'UTC', hint: 'UTC' },
];

/** The list with the current value appended when it is not one of the presets (never dropped, never altered). */
export function withCurrentValue(options: readonly PreferenceOption[], current: string): PreferenceOption[] {
  if (current === '' || options.some((option) => option.value === current)) {
    return [...options];
  }
  return [{ value: current, label: current, hint: 'Cari dəyər' }, ...options];
}

export function preferenceLabel(options: readonly PreferenceOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
