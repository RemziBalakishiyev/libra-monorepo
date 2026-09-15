import type { PagedSleepSessions, SleepDay, SleepSession, SleepSummary } from '@/lib/api/sleep';

/**
 * Fixed instants, never "now". Every sleep test drives its own clock, so a fixture that was written as
 * "three hours ago" would quietly change meaning on the day the suite is run.
 */
export const sleepNow = new Date('2026-09-10T09:00:00Z');

export function makeSession(overrides: Partial<SleepSession> = {}): SleepSession {
  const startedAtUtc = overrides.startedAtUtc ?? '2026-09-09T19:00:00Z';
  const endedAtUtc = overrides.endedAtUtc === undefined ? '2026-09-10T03:30:00Z' : overrides.endedAtUtc;
  return {
    id: 'sleep-1',
    startedAtUtc,
    endedAtUtc,
    isOpen: endedAtUtc === null,
    durationMinutes: endedAtUtc === null ? null : Math.round((Date.parse(endedAtUtc) - Date.parse(startedAtUtc)) / 60_000),
    wakeDate: endedAtUtc === null ? null : '2026-09-10',
    quality: null,
    note: null,
    clientRequestId: null,
    createdAtUtc: startedAtUtc,
    updatedAtUtc: endedAtUtc ?? startedAtUtc,
    ...overrides,
  };
}

/** An open session: no end, no duration, no wake date — exactly what the API returns while one is running. */
export function makeOpenSession(overrides: Partial<SleepSession> = {}): SleepSession {
  return makeSession({ endedAtUtc: null, ...overrides });
}

export function makeDays(minutes: readonly (number | null)[], from = '2026-09-04'): SleepDay[] {
  return minutes.map((total, index) => {
    const date = new Date(`${from}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), totalMinutes: total, sessionCount: total === null ? 0 : 1 };
  });
}

export function makeSummary(overrides: Partial<SleepSummary> = {}): SleepSummary {
  const days = overrides.days ?? makeDays([null, 420, null, 480, null, null, 450]);
  const recorded = days.filter((day) => day.totalMinutes !== null);
  const totalMinutes = recorded.reduce((sum, day) => sum + (day.totalMinutes ?? 0), 0);
  return {
    timeZone: 'Asia/Baku',
    from: days[0]?.date ?? '2026-09-04',
    to: days[days.length - 1]?.date ?? '2026-09-10',
    days,
    averageMinutes: recorded.length === 0 ? null : Math.round(totalMinutes / recorded.length),
    recordedDays: recorded.length,
    totalMinutes,
    sessionCount: recorded.length,
    active: null,
    latest: null,
    ...overrides,
  };
}

export function pagedSessions(items: readonly SleepSession[]): PagedSleepSessions {
  return { items: [...items], pageNumber: 1, pageSize: 20, totalCount: items.length, hasNextPage: false };
}
