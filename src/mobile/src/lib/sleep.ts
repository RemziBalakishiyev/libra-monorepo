/**
 * Sleep helpers shared by the Home card, the sleep screen and the forms.
 *
 * Every duration here is computed from two UTC instants. The screen's ticking display is only a rendering of
 * that arithmetic against the current clock — it is never what gets stored, and it never feeds a total.
 */

import type { SleepDay, SleepSession, SleepSummary } from '@/lib/api/sleep';
import { formatShortDate, isoDateOf, todayIsoDate, weekdayShortNames } from '@/lib/dates';

/** Whole minutes between two instants, rounded the way the server rounds. */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000);
}

/** How long a session has run at `now`: its recorded length once closed, the live distance while open. */
export function elapsedMinutes(session: SleepSession, now: Date = new Date()): number {
  if (session.durationMinutes !== null) {
    return session.durationMinutes;
  }
  return Math.max(0, Math.floor((now.getTime() - Date.parse(session.startedAtUtc)) / 60_000));
}

/** "7 s 30 d" — the house format for a night. Zero minutes is "0 d", never an empty string. */
export function formatDuration(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours === 0) {
    return `${minutes} d`;
  }
  return minutes === 0 ? `${hours} s` : `${hours} s ${minutes} d`;
}

/** The same figure spelled out for a screen reader, so "7 s 30 d" is not read as letters. */
export function describeDuration(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours === 0) {
    return `${minutes} dəqiqə`;
  }
  return minutes === 0 ? `${hours} saat` : `${hours} saat ${minutes} dəqiqə`;
}

/**
 * The recorded length of a completed night for a compact card. A genuine positive duration under a minute is
 * said plainly instead of being rounded up to "1 d" or down to "0 d"; nothing here ever renders a missing
 * record as zero — callers pass a session only when one exists.
 */
export function recordedDurationLabel(session: SleepSession): { text: string; spoken: string } {
  if (session.endedAtUtc) {
    const milliseconds = Date.parse(session.endedAtUtc) - Date.parse(session.startedAtUtc);
    if (milliseconds > 0 && milliseconds < 60_000) {
      return { text: '1 dəq-dən az', spoken: 'bir dəqiqədən az' };
    }
  }
  const minutes = session.durationMinutes ?? (session.endedAtUtc ? minutesBetween(session.startedAtUtc, session.endedAtUtc) : 0);
  return { text: formatDuration(minutes), spoken: describeDuration(minutes) };
}

/** Local clock time of an instant, "23:45". */
export function timeOf(utcIso: string): string {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** "23:45 – 07:15" for a completed night, or "23:45 – …" while one is still running. */
export function formatInterval(session: SleepSession): string {
  return `${timeOf(session.startedAtUtc)} – ${session.endedAtUtc ? timeOf(session.endedAtUtc) : '…'}`;
}

export const qualityLabels: Record<number, string> = {
  1: 'Çox pis',
  2: 'Pis',
  3: 'Normal',
  4: 'Yaxşı',
  5: 'Əla',
};

export function qualityLabel(quality: number | null): string | null {
  return quality === null ? null : (qualityLabels[quality] ?? String(quality));
}

/** One-line label for the day a night belongs to: "Bu gün", "Dünən", otherwise the short date. */
export function wakeDayLabel(session: SleepSession, today = todayIsoDate()): string {
  if (!session.wakeDate) {
    return 'Davam edir';
  }
  const difference = Math.round((Date.parse(`${session.wakeDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (difference === 0) {
    return 'Bu gün';
  }
  if (difference === -1) {
    return 'Dünən';
  }
  return formatShortDate(session.wakeDate);
}

/** Short weekday initial for a date in the seven-day strip ("B.e.", "Ç.a." …). */
export function weekdayLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return weekdayShortNames[new Date(year, month - 1, day, 12).getDay()] ?? '';
}

/** The tallest bar in the strip, so the rest can be drawn in proportion. Never zero, so nothing divides by 0. */
export function peakMinutes(days: readonly SleepDay[]): number {
  return Math.max(1, ...days.map((day) => day.totalMinutes ?? 0));
}

/**
 * The weekly average, spelled out with its denominator. It is an average over the days that actually have a
 * record, so a week with two nights in it never reads as if the other five were zeros.
 */
export function averageLabel(summary: SleepSummary | undefined): string {
  if (!summary || summary.averageMinutes === null || summary.recordedDays === 0) {
    return 'Hələ qeyd yoxdur';
  }
  return `${formatDuration(summary.averageMinutes)} · ${summary.recordedDays} gün üzrə`;
}

/** What one date in the strip says when it is read out. A date with no record is not zero sleep. */
export function describeDay(day: SleepDay): string {
  const date = formatShortDate(day.date);
  return day.totalMinutes === null ? `${date}: Qeyd yoxdur` : `${date}: ${describeDuration(day.totalMinutes)}`;
}

/** Splits a UTC instant into the local date and time the form edits. */
export function splitInstant(utcIso: string): { date: string; time: string } {
  const date = new Date(utcIso);
  return Number.isNaN(date.getTime()) ? { date: todayIsoDate(), time: '00:00' } : { date: isoDateOf(date), time: timeOf(utcIso) };
}
