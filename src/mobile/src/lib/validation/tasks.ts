import { z } from 'zod';

import { taskPrioritySchema, taskRecurrenceKindSchema } from '@/lib/api/tasks';
import { isoDateSchema, timeSchema } from '@/lib/validation/nutrition';

/**
 * The task form. A title is the only thing the user must supply — the date and priority arrive with sensible
 * defaults, and the time, note and recurrence stay optional so the quick path stays one field long.
 */
export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, 'Tapşırığın adını yazın.').max(200, 'Ad çox uzundur.'),
    date: isoDateSchema,
    /** Empty means "no particular time"; the task is then due by the end of its day. */
    time: z.union([timeSchema, z.literal('')]),
    priority: taskPrioritySchema,
    note: z.string().trim().max(1000, 'Qeyd çox uzundur.'),
    recurrence: taskRecurrenceKindSchema,
    /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
    weekdays: z.array(z.number().int().min(1).max(7)),
    /** Empty means the schedule has no end. */
    endDate: z.union([isoDateSchema, z.literal('')]),
  })
  .refine((form) => form.recurrence !== 'Weekly' || form.weekdays.length > 0, {
    message: 'Ən azı bir gün seçin.',
    path: ['weekdays'],
  })
  .refine((form) => form.recurrence === 'None' || form.endDate === '' || form.endDate >= form.date, {
    message: 'Bitmə tarixi başlanğıcdan əvvəl ola bilməz.',
    path: ['endDate'],
  });

export type TaskForm = z.infer<typeof taskFormSchema>;
