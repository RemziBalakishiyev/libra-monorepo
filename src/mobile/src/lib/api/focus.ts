import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const focusOutcomeSchema = z.enum(['Completed', 'Stopped']);

export const focusSessionSchema = z.object({
  id: z.string(),
  clientSessionId: z.string(),
  taskId: z.string().nullable(),
  taskTitle: z.string().nullable(),
  configuredSeconds: z.number(),
  startedAtUtc: z.string(),
  endedAtUtc: z.string(),
  activeSeconds: z.number(),
  outcome: focusOutcomeSchema,
  createdAtUtc: z.string(),
});

/**
 * One local day's focus. `activeSeconds` is the time actually spent on that date — a run that crossed local
 * midnight counts on both days in the proportion it was spent — and `completedSessions` counts only runs that
 * reached their configured duration.
 */
export const focusDaySchema = z.object({
  date: z.string(),
  activeSeconds: z.number(),
  completedSessions: z.number(),
  stoppedSessions: z.number(),
});

export const focusSummarySchema = z.object({
  timeZone: z.string(),
  today: focusDaySchema,
});

export type FocusSessionResponse = z.infer<typeof focusSessionSchema>;
export type FocusDay = z.infer<typeof focusDaySchema>;
export type FocusSummary = z.infer<typeof focusSummarySchema>;

/** The upload shape. The client id is generated before the run starts, so a retry is the same record. */
export interface SaveFocusSessionInput {
  clientSessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  configuredSeconds: number;
  intervals: { startedAtUtc: string; endedAtUtc: string }[];
  outcome: 'Completed' | 'Stopped';
}

const auth = { auth: true } as const;

export const focusApi = {
  /** Idempotent on `clientSessionId`: the outbox may retry this as often as it needs to. */
  save: (input: SaveFocusSessionInput) => apiRequest('/api/focus/sessions', { ...auth, method: 'POST', body: input, schema: focusSessionSchema }),

  summary: (signal?: AbortSignal) => apiRequest('/api/focus/summary', { ...auth, schema: focusSummarySchema, signal }),
};
