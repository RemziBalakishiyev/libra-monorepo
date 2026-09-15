import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';
import { transactionSchema, transactionTypeSchema } from '@/lib/api/finance';

export const occurrenceStatusSchema = z.enum(['Pending', 'Recorded', 'Skipped']);

/** A monthly plan. It never moves money on its own; each month is recorded by hand or not at all. */
export const recurringTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: transactionTypeSchema,
  amount: z.number(),
  currencyCode: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  dayOfMonth: z.number(),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isActive: z.boolean(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

/**
 * One template in one month. `Pending` rows are computed by the server from the plan and hold nothing; `Recorded`
 * rows point at the one transaction the confirmation created; `Skipped` rows are months the user declined or undid.
 */
export const recurringOccurrenceSchema = z.object({
  templateId: z.string(),
  occurrenceId: z.string().nullable(),
  year: z.number(),
  month: z.number(),
  dueDate: z.string(),
  status: occurrenceStatusSchema,
  title: z.string(),
  type: transactionTypeSchema,
  amount: z.number(),
  currencyCode: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  transactionId: z.string().nullable(),
  recordedAtUtc: z.string().nullable(),
  templateIsActive: z.boolean(),
  updatedAtUtc: z.string().nullable(),
});

export const currencyAmountSchema = z.object({ currencyCode: z.string(), income: z.number(), expense: z.number() });

export const recurringMonthSchema = z.object({
  year: z.number(),
  month: z.number(),
  timeZone: z.string(),
  occurrences: z.array(recurringOccurrenceSchema),
  pendingTotals: z.array(currencyAmountSchema),
  recordedTotals: z.array(currencyAmountSchema),
});

export const recordOccurrenceResponseSchema = z.object({
  occurrence: recurringOccurrenceSchema,
  transaction: transactionSchema,
});

export type RecurringTemplate = z.infer<typeof recurringTemplateSchema>;
export type RecurringOccurrence = z.infer<typeof recurringOccurrenceSchema>;
export type RecurringMonth = z.infer<typeof recurringMonthSchema>;
export type OccurrenceStatus = z.infer<typeof occurrenceStatusSchema>;
export type RecordOccurrenceResponse = z.infer<typeof recordOccurrenceResponseSchema>;

export interface RecurringTemplateInput {
  title: string;
  type: 'Income' | 'Expense';
  amount: number;
  categoryId: string;
  accountId: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  note: string | null;
}

export interface RecurringTemplateUpdateInput extends RecurringTemplateInput {
  isActive: boolean;
  /** Echoed from the last read; a newer stored value means someone else changed it (409). */
  expectedUpdatedAtUtc: string | null;
}

/** The user's review before money is recorded. Absent fields fall back to the template. */
export interface RecordOccurrenceInput {
  accountId: string | null;
  amount: number | null;
  occurredOn: string | null;
  note: string | null;
}

const auth = { auth: true } as const;

export const recurringApi = {
  month: (year: number, month: number, signal?: AbortSignal) =>
    apiRequest(`/api/finance/recurring?year=${year}&month=${month}`, { ...auth, schema: recurringMonthSchema, signal }),

  listTemplates: (signal?: AbortSignal) => apiRequest('/api/finance/recurring/templates', { ...auth, schema: z.array(recurringTemplateSchema), signal }),

  getTemplate: (id: string, signal?: AbortSignal) => apiRequest(`/api/finance/recurring/templates/${id}`, { ...auth, schema: recurringTemplateSchema, signal }),

  createTemplate: (input: RecurringTemplateInput, clientRequestId: string) =>
    apiRequest('/api/finance/recurring/templates', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: recurringTemplateSchema }),

  updateTemplate: (id: string, input: RecurringTemplateUpdateInput) =>
    apiRequest(`/api/finance/recurring/templates/${id}`, { ...auth, method: 'PUT', body: input, schema: recurringTemplateSchema }),

  deleteTemplate: (id: string) => apiRequest(`/api/finance/recurring/templates/${id}`, { ...auth, method: 'DELETE' }),

  /** The one call that records money. Idempotent per month: a retry, with any key, returns the same recording. */
  record: (templateId: string, year: number, month: number, input: RecordOccurrenceInput, clientRequestId: string) =>
    apiRequest(`/api/finance/recurring/templates/${templateId}/occurrences/${year}/${month}/record`, {
      ...auth,
      method: 'POST',
      body: { ...input, clientRequestId },
      schema: recordOccurrenceResponseSchema,
    }),

  skip: (templateId: string, year: number, month: number) =>
    apiRequest(`/api/finance/recurring/templates/${templateId}/occurrences/${year}/${month}/skip`, { ...auth, method: 'POST', body: {}, schema: recurringOccurrenceSchema }),

  /** Deletes the recorded transaction and leaves the month skipped; safe to repeat. */
  undo: (templateId: string, year: number, month: number) =>
    apiRequest(`/api/finance/recurring/templates/${templateId}/occurrences/${year}/${month}/undo`, { ...auth, method: 'POST', body: {}, schema: recurringOccurrenceSchema }),
};
