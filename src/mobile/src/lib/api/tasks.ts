import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const taskPrioritySchema = z.enum(['Low', 'Normal', 'High']);
export const taskStateSchema = z.enum(['Pending', 'Completed', 'Removed']);
export const taskRecurrenceKindSchema = z.enum(['None', 'Daily', 'Weekly']);
export const taskViewSchema = z.enum(['Today', 'Upcoming', 'Completed']);

export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export type TaskRecurrenceKind = z.infer<typeof taskRecurrenceKindSchema>;
export type TaskView = z.infer<typeof taskViewSchema>;

/**
 * One task on one day. `plannedDate` is a local calendar date (YYYY-MM-DD) and `plannedTime` a local time
 * (HH:MM:SS); the timestamps are UTC instants. `isOverdue` is decided by the server in the profile time zone,
 * so the app never has to guess where the day boundary is.
 */
export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  plannedDate: z.string(),
  plannedTime: z.string().nullable(),
  priority: taskPrioritySchema,
  state: taskStateSchema,
  isCompleted: z.boolean(),
  completedAtUtc: z.string().nullable(),
  isOverdue: z.boolean(),
  seriesId: z.string().nullable(),
  seriesKind: taskRecurrenceKindSchema.nullable(),
  clientRequestId: z.string().nullable(),
  createdAtUtc: z.string(),
  /** Echoed back with an edit; a newer value on the server means someone else changed it first. */
  updatedAtUtc: z.string(),
});

/** Counts over the whole matching set, never over the page on screen. */
export const taskCountsSchema = z.object({
  scheduled: z.number(),
  completed: z.number(),
  overdue: z.number(),
});

export const taskDaySchema = z.object({
  date: z.string(),
  timeZone: z.string(),
  counts: taskCountsSchema,
  tasks: z.array(taskSchema),
  overdue: z.array(taskSchema),
});

export const taskSeriesSchema = z.object({
  id: z.string(),
  title: z.string(),
  note: z.string().nullable(),
  plannedTime: z.string().nullable(),
  priority: taskPrioritySchema,
  kind: taskRecurrenceKindSchema,
  weekdays: z.array(z.number()),
  startDate: z.string(),
  endDate: z.string().nullable(),
  isStopped: z.boolean(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const taskHistoryEntrySchema = z.object({
  kind: z.enum(['Completed', 'Reopened']),
  occurredAtUtc: z.string(),
});

export const taskDetailSchema = z.object({
  task: taskSchema,
  series: taskSeriesSchema.nullable(),
  history: z.array(taskHistoryEntrySchema),
});

const pagedTasksSchema = z.object({
  items: z.array(taskSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

export type Task = z.infer<typeof taskSchema>;
export type TaskCounts = z.infer<typeof taskCountsSchema>;
export type TaskDay = z.infer<typeof taskDaySchema>;
export type TaskSeries = z.infer<typeof taskSeriesSchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>;
export type PagedTasks = z.infer<typeof pagedTasksSchema>;

/** The repeating schedule a create asks for. Omitted entirely for a one-off task. */
export interface TaskRecurrenceInput {
  kind: Exclude<TaskRecurrenceKind, 'None'>;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. Weekly only. */
  weekdays?: number[];
  startDate?: string;
  endDate?: string | null;
}

export interface CreateTaskInput {
  title: string;
  note: string | null;
  plannedDate: string;
  plannedTime: string | null;
  priority: TaskPriority;
  recurrence?: TaskRecurrenceInput;
}

export interface UpdateTaskInput {
  title: string;
  note: string | null;
  plannedDate: string;
  plannedTime: string | null;
  priority: TaskPriority;
  /** What the client last read. The API refuses the edit when the stored row moved on since then. */
  expectedUpdatedAtUtc: string | null;
}

export interface UpdateTaskSeriesInput {
  title: string;
  note: string | null;
  plannedTime: string | null;
  priority: TaskPriority;
  recurrence: TaskRecurrenceInput;
  expectedUpdatedAtUtc: string | null;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== '');
  if (entries.length === 0) {
    return '';
  }
  return '?' + entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
}

const auth = { auth: true } as const;

export const tasksApi = {
  /** One local day: what is planned for it, what is done, and what is still owed from earlier days. */
  day: (date: string | undefined, signal?: AbortSignal) =>
    apiRequest(`/api/tasks/today${query({ date })}`, { ...auth, schema: taskDaySchema, signal }),

  list: (view: TaskView, pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/tasks${query({ view, pageNumber, pageSize })}`, { ...auth, schema: pagedTasksSchema, signal }),

  get: (id: string, signal?: AbortSignal) => apiRequest(`/api/tasks/${id}`, { ...auth, schema: taskDetailSchema, signal }),

  create: (input: CreateTaskInput, clientRequestId: string) =>
    apiRequest('/api/tasks', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: taskSchema }),

  update: (id: string, input: UpdateTaskInput) =>
    apiRequest(`/api/tasks/${id}`, { ...auth, method: 'PUT', body: input, schema: taskSchema }),

  /** The desired state, not a toggle: a retried request is harmless. */
  setCompletion: (id: string, completed: boolean) =>
    apiRequest(`/api/tasks/${id}/completion`, { ...auth, method: 'POST', body: { completed }, schema: taskSchema }),

  remove: (id: string) => apiRequest(`/api/tasks/${id}`, { ...auth, method: 'DELETE' }),

  updateSeries: (id: string, input: UpdateTaskSeriesInput) =>
    apiRequest(`/api/tasks/series/${id}`, { ...auth, method: 'PUT', body: input, schema: taskSeriesSchema }),

  stopSeries: (id: string) => apiRequest(`/api/tasks/series/${id}/stop`, { ...auth, method: 'POST', schema: taskSeriesSchema }),
};
