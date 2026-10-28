import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const assistantModuleSchema = z.enum(['Finance', 'Nutrition', 'Tasks', 'Sleep', 'Focus']);
export const assistantPeriodSchema = z.enum(['Today', 'LastSevenDays']);
export const assistantOutcomeSchema = z.enum(['Answer', 'InsufficientData', 'ClarificationNeeded', 'Refusal']);
export const factAvailabilitySchema = z.enum(['Available', 'NoRecords', 'Partial', 'Unavailable']);

/**
 * One grounded figure. The client renders metric cards from these and never from the assistant's prose, so a
 * number on screen is always one this application computed.
 */
export const assistantFactSchema = z.object({
  id: z.string(),
  module: assistantModuleSchema,
  label: z.string(),
  availability: factAvailabilitySchema,
  value: z.number().nullable(),
  unit: z.string().nullable(),
  text: z.string().nullable(),
  period: z.string(),
  caveat: z.string().nullable(),
  sourceRoute: z.string().nullable(),
});

export const assistantSnapshotSchema = z.object({
  timeZone: z.string(),
  rangeFrom: z.string(),
  rangeTo: z.string(),
  collectedAtUtc: z.string(),
  modules: z.array(assistantModuleSchema),
  facts: z.array(assistantFactSchema),
});

export const assistantAnswerSchema = z.object({
  outcome: assistantOutcomeSchema,
  summary: z.string(),
  observations: z.array(z.object({ text: z.string(), factIds: z.array(z.string()) })),
  suggestions: z.array(z.string()),
  followUps: z.array(z.string()),
  clarification: z.string().nullable(),
  model: z.string(),
  isFixture: z.boolean(),
  snapshot: assistantSnapshotSchema,
});

export const assistantMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAtUtc: z.string(),
  answer: assistantAnswerSchema.nullable(),
});

export const assistantConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  modules: z.array(assistantModuleSchema),
  period: assistantPeriodSchema,
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
  messages: z.array(assistantMessageSchema),
});

export const assistantSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  modules: z.array(assistantModuleSchema),
  period: assistantPeriodSchema,
  updatedAtUtc: z.string(),
});

const pagedConversationsSchema = z.object({
  items: z.array(assistantSummarySchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

/** Whether the assistant can answer at all. `isConfigured` false is shown plainly, never worked around. */
export const assistantStatusSchema = z.object({
  isConfigured: z.boolean(),
  isFixture: z.boolean(),
  model: z.string().nullable(),
  defaultModules: z.array(assistantModuleSchema),
});

export type AssistantModule = z.infer<typeof assistantModuleSchema>;
export type AssistantPeriod = z.infer<typeof assistantPeriodSchema>;
export type AssistantOutcome = z.infer<typeof assistantOutcomeSchema>;
export type AssistantFact = z.infer<typeof assistantFactSchema>;
export type AssistantSnapshot = z.infer<typeof assistantSnapshotSchema>;
export type AssistantAnswer = z.infer<typeof assistantAnswerSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantConversation = z.infer<typeof assistantConversationSchema>;
export type AssistantSummary = z.infer<typeof assistantSummarySchema>;
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;

export interface AskAssistantInput {
  conversationId: string | null;
  question: string;
  modules: AssistantModule[];
  period: AssistantPeriod;
  /** Generated before the send, so a retry after an uncertain answer never asks — or pays — twice. */
  clientRequestId: string;
}

const auth = { auth: true } as const;

export const assistantApi = {
  status: (signal?: AbortSignal) => apiRequest('/api/assistant/status', { ...auth, schema: assistantStatusSchema, signal }),

  ask: (input: AskAssistantInput) => apiRequest('/api/assistant/ask', { ...auth, method: 'POST', body: input, schema: assistantConversationSchema }),

  conversations: (pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/assistant/conversations?pageNumber=${pageNumber}&pageSize=${pageSize}`, { ...auth, schema: pagedConversationsSchema, signal }),

  conversation: (id: string, signal?: AbortSignal) =>
    apiRequest(`/api/assistant/conversations/${id}`, { ...auth, schema: assistantConversationSchema, signal }),

  remove: (id: string) => apiRequest(`/api/assistant/conversations/${id}`, { ...auth, method: 'DELETE' }),
};
