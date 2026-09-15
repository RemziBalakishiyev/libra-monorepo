import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

/**
 * One sleep session. Both ends are UTC instants and `durationMinutes` is derived from them on the server, so
 * the app never has to add up a running timer to know how long a night was.
 */
export const sleepSessionSchema = z.object({
  id: z.string(),
  startedAtUtc: z.string(),
  endedAtUtc: z.string().nullable(),
  isOpen: z.boolean(),
  durationMinutes: z.number().nullable(),
  /** The local date this night is counted on: the day the user woke up. */
  wakeDate: z.string().nullable(),
  quality: z.number().nullable(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  /** Echoed back with a correction; a newer value on the server means someone else changed it. */
  updatedAtUtc: z.string(),
});

/** `totalMinutes` is null for a date with nothing recorded — which is not the same as sleeping zero minutes. */
export const sleepDaySchema = z.object({
  date: z.string(),
  totalMinutes: z.number().nullable(),
  sessionCount: z.number(),
});

export const sleepSummarySchema = z.object({
  timeZone: z.string(),
  from: z.string(),
  to: z.string(),
  days: z.array(sleepDaySchema),
  /** Mean over `recordedDays`, not over seven; null when the window holds nothing. */
  averageMinutes: z.number().nullable(),
  recordedDays: z.number(),
  totalMinutes: z.number(),
  sessionCount: z.number(),
  active: sleepSessionSchema.nullable(),
  latest: sleepSessionSchema.nullable(),
});

const pagedSessionsSchema = z.object({
  items: z.array(sleepSessionSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

export type SleepSession = z.infer<typeof sleepSessionSchema>;
export type SleepDay = z.infer<typeof sleepDaySchema>;
export type SleepSummary = z.infer<typeof sleepSummarySchema>;
export type PagedSleepSessions = z.infer<typeof pagedSessionsSchema>;

export interface RecordSleepInput {
  startedAtUtc: string;
  endedAtUtc: string;
  quality: number | null;
  note: string | null;
}

export interface CorrectSleepInput {
  startedAtUtc: string;
  /** Null keeps the session open — how a forgotten night is fixed rather than closed for the user. */
  endedAtUtc: string | null;
  quality: number | null;
  note: string | null;
  expectedUpdatedAtUtc: string | null;
}

const auth = { auth: true } as const;

export const sleepApi = {
  /**
   * The running session, or null. This is what the app restores on launch: the server is the source of truth
   * for whether a night is in progress, never a flag the app kept.
   */
  active: async (signal?: AbortSignal): Promise<SleepSession | null> =>
    (await apiRequest('/api/sleep/active', { ...auth, schema: sleepSessionSchema, signal })) ?? null,

  summary: (date: string | undefined, signal?: AbortSignal) =>
    apiRequest(`/api/sleep/summary${date ? `?date=${encodeURIComponent(date)}` : ''}`, { ...auth, schema: sleepSummarySchema, signal }),

  history: (pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/sleep/sessions?pageNumber=${pageNumber}&pageSize=${pageSize}`, { ...auth, schema: pagedSessionsSchema, signal }),

  get: (id: string, signal?: AbortSignal) => apiRequest(`/api/sleep/sessions/${id}`, { ...auth, schema: sleepSessionSchema, signal }),

  /** Begins a night. The retry key makes an answer that never arrived safe to ask for again. */
  start: (clientRequestId: string, startedAtUtc?: string) =>
    apiRequest('/api/sleep/start', { ...auth, method: 'POST', body: { startedAtUtc: startedAtUtc ?? null, clientRequestId }, schema: sleepSessionSchema }),

  /**
   * Closes one named session at the moment the user pressed "Oyandım". That instant is captured once on the
   * device, so a retry after a failure records when they woke, not when the network came back.
   */
  stop: (id: string, endedAtUtc: string) =>
    apiRequest(`/api/sleep/sessions/${id}/stop`, { ...auth, method: 'POST', body: { endedAtUtc }, schema: sleepSessionSchema }),

  record: (input: RecordSleepInput, clientRequestId: string) =>
    apiRequest('/api/sleep/sessions', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: sleepSessionSchema }),

  correct: (id: string, input: CorrectSleepInput) =>
    apiRequest(`/api/sleep/sessions/${id}`, { ...auth, method: 'PUT', body: input, schema: sleepSessionSchema }),

  remove: (id: string) => apiRequest(`/api/sleep/sessions/${id}`, { ...auth, method: 'DELETE' }),
};
