/**
 * Date helpers for forms and lists. The device time zone is used for entry and display; the API stores UTC.
 * MVP assumption: the device time zone matches the profile time zone (Asia/Baku by default).
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayIsoDate(now = new Date()): string {
  return isoDateOf(now);
}

export function isoDateOf(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Local calendar date (noon, so DST never shifts the day) from an ISO date string. */
export function dateFromIso(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Turns a local calendar date into a UTC instant. Today keeps the current time of day so ordering within the
 * day is preserved; other days use local noon so the instant stays inside that local day everywhere.
 */
export function localDateToUtcIso(isoDate: string, now = new Date()): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const isToday = isoDate === todayIsoDate(now);
  const local = isToday ? new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()) : new Date(year, month - 1, day, 12, 0, 0);
  return local.toISOString();
}

export function utcIsoToLocalDate(utcIso: string): string {
  return todayIsoDate(new Date(utcIso));
}

const shortMonthNames = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'] as const;

export const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'] as const;

/** Lower-case month names for running text and dates: "6 sentyabr 2026". */
const monthNamesLower = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'] as const;

export const weekdayShortNames = ['B.', 'B.e.', 'Ç.a.', 'Ç.', 'C.a.', 'C.', 'Ş.'] as const;
export const weekdayNames = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'] as const;

/** "06 sen 2026" in the device time zone. Own month names: browser ICU data for az-AZ is incomplete. */
export function formatDate(utcIso: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  return `${String(date.getDate()).padStart(2, '0')} ${shortMonthNames[date.getMonth()]} ${date.getFullYear()}`;
}

/** "6 sen" — compact metadata in lists (year omitted when it is the current year). */
export function formatShortDate(utcIso: string, now = new Date()): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  const base = `${date.getDate()} ${shortMonthNames[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? base : `${base} ${date.getFullYear()}`;
}

/** "6 sentyabr 2026" from a local ISO date (YYYY-MM-DD) or a UTC instant. */
export function formatLongDate(value: string): string {
  const date = ISO_DATE.test(value) ? dateFromIso(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.getDate()} ${monthNamesLower[date.getMonth()]} ${date.getFullYear()}`;
}

/** "Bazar ertəsi, 6 sentyabr" for greetings. */
export function formatWeekdayDate(date: Date): string {
  return `${weekdayNames[date.getDay()]}, ${date.getDate()} ${monthNamesLower[date.getMonth()]}`;
}

/** Relative day label for lists: "Bu gün", "Dünən", otherwise the short date. */
export function formatRelativeDay(utcIso: string, now = new Date()): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return utcIso;
  }
  const dayDifference = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (dayDifference === 0) {
    return 'Bu gün';
  }
  if (dayDifference === 1) {
    return 'Dünən';
  }
  return formatShortDate(utcIso, now);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatMonth(year: number, month: number): string {
  return `${monthNames[month - 1]} ${year}`;
}

export function currentYearMonth(now = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Calendar day of a UTC instant in the given IANA time zone (the profile time zone reported by the API).
 * Falls back to the device zone when the runtime lacks the zone data, so a bucket is never lost.
 */
export function calendarDayIn(utcIso: string, timeZone?: string): CalendarDay {
  const date = new Date(utcIso);
  if (timeZone) {
    try {
      let formatter = partsCache.get(timeZone);
      if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
        partsCache.set(timeZone, formatter);
      }
      const parts = formatter.formatToParts(date);
      const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
      const year = read('year');
      const month = read('month');
      const day = read('day');
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return { year, month, day };
      }
    } catch {
      // Unknown zone in this runtime: use the device zone below.
    }
  }
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

/** "6 sen" style label for a calendar day. */
export function formatDayShort(year: number, month: number, day: number): string {
  return `${day} ${shortMonthNames[month - 1]}`;
}

/** Long label for a calendar day: "6 sentyabr 2026". */
export function formatDayLong(year: number, month: number, day: number): string {
  return `${day} ${monthNamesLower[month - 1]} ${year}`;
}
