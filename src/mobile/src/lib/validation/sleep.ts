import { z } from 'zod';

import { isoDateSchema, timeSchema } from '@/lib/validation/nutrition';

/** The longest a completed night may be, matching the server's own rule. */
export const maxSleepMinutes = 24 * 60;

/** Turns a local date and time into the UTC instant the API stores. */
export function toInstant(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * The instant to send for a field pair, preserving what is already stored when nothing really changed.
 *
 * The form edits whole minutes, so re-saving a session that was recorded at 06:41:37 would otherwise silently
 * move its end to 06:41:00 — a correction the user never made, just for adding a rating. When the edited fields
 * still name the same minute as the stored instant, the stored instant is sent back untouched.
 */
export function instantFor(date: string, time: string, stored: string | null | undefined): string {
  const edited = toInstant(date, time);
  if (stored) {
    const storedMs = Date.parse(stored);
    if (Number.isFinite(storedMs) && Math.floor(storedMs / 60_000) === edited.getTime() / 60_000) {
      return stored;
    }
  }
  return edited.toISOString();
}

/** The instants a correction started from, so the rules below judge what will actually be sent. */
export interface StoredInterval {
  startedAtUtc: string;
  endedAtUtc: string | null;
}

/**
 * The manual-entry and correction form. A night is two local moments; every rule the server enforces is
 * checked here too, so the user sees which field is wrong instead of a request that comes back refused.
 *
 * `open` covers the forgotten night: correcting a session that is still running may fix its start and leave it
 * running, so the 24-hour limit — which only applies to a finished interval — is not applied to it either.
 *
 * `stored` is what a correction is editing. The rules are checked against the instants the form will send, not
 * against the minutes on screen: a night that began and ended inside the same minute is a real, ordered
 * interval, and rating it must not fail a comparison the user has no way to satisfy.
 */
export function createSleepFormSchema(stored?: StoredInterval) {
  return z
  .object({
    startDate: isoDateSchema,
    startTime: timeSchema,
    endDate: isoDateSchema,
    endTime: timeSchema,
    /** True while the session is deliberately left running; the end fields are then not part of the record. */
    open: z.boolean(),
    /** '' means no rating; the night is recorded either way. */
    quality: z.union([z.enum(['1', '2', '3', '4', '5']), z.literal('')]),
    note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
  })
  .superRefine((form, context) => {
    const start = Date.parse(instantFor(form.startDate, form.startTime, stored?.startedAtUtc));
    const now = Date.now();

    if (start > now) {
      context.addIssue({ code: 'custom', message: 'Yuxu başlanğıcı gələcəkdə ola bilməz.', path: ['startTime'] });
    }

    if (form.open) {
      return;
    }

    const end = Date.parse(instantFor(form.endDate, form.endTime, stored?.endedAtUtc));
    if (end <= start) {
      context.addIssue({ code: 'custom', message: 'Oyanma vaxtı yuxu başlanğıcından sonra olmalıdır.', path: ['endTime'] });
      return;
    }
    if (end > now) {
      context.addIssue({ code: 'custom', message: 'Oyanma vaxtı gələcəkdə ola bilməz.', path: ['endTime'] });
    }
    if ((end - start) / 60_000 > maxSleepMinutes) {
      context.addIssue({ code: 'custom', message: 'Bir yuxu ən çox 24 saat ola bilər.', path: ['endTime'] });
    }
  });
}

/** The schema for a night that is being entered by hand, with nothing already stored behind it. */
export const sleepFormSchema = createSleepFormSchema();

export type SleepForm = z.infer<typeof sleepFormSchema>;
