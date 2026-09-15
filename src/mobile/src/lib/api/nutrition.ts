import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';

export const mealTypeSchema = z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack']);
export const quantityModeSchema = z.enum(['PerPortion', 'Per100Grams']);

export type MealType = z.infer<typeof mealTypeSchema>;
export type QuantityMode = z.infer<typeof quantityModeSchema>;

/** The four meals, in diary order. */
export const mealTypes: readonly MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export const nutritionItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantityMode: quantityModeSchema,
  quantity: z.number(),
  energyKcalPerUnit: z.number(),
  proteinGramsPerUnit: z.number(),
  carbGramsPerUnit: z.number(),
  fatGramsPerUnit: z.number(),
  energyKcal: z.number(),
  proteinGrams: z.number(),
  carbGrams: z.number(),
  fatGrams: z.number(),
  position: z.number(),
});

export const nutritionEntrySchema = z.object({
  id: z.string(),
  mealType: mealTypeSchema,
  consumedAtUtc: z.string(),
  note: z.string().nullable(),
  clientRequestId: z.string().nullable(),
  energyKcal: z.number(),
  proteinGrams: z.number(),
  carbGrams: z.number(),
  fatGrams: z.number(),
  items: z.array(nutritionItemSchema),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const nutritionTotalsSchema = z.object({
  energyKcal: z.number(),
  proteinGrams: z.number(),
  carbGrams: z.number(),
  fatGrams: z.number(),
});

export const nutritionGoalSchema = z.object({
  id: z.string(),
  effectiveFrom: z.string(),
  energyKcal: z.number().nullable(),
  proteinGrams: z.number().nullable(),
  carbGrams: z.number().nullable(),
  fatGrams: z.number().nullable(),
  createdAtUtc: z.string(),
  updatedAtUtc: z.string(),
});

export const nutritionDaySchema = z.object({
  date: z.string(),
  timeZone: z.string(),
  startUtc: z.string(),
  endUtc: z.string(),
  totals: nutritionTotalsSchema,
  entryCount: z.number(),
  goal: nutritionGoalSchema.nullable(),
  meals: z.array(
    z.object({
      mealType: mealTypeSchema,
      totals: nutritionTotalsSchema,
      entries: z.array(nutritionEntrySchema),
    }),
  ),
});

export const nutritionGoalsSchema = z.object({
  date: z.string(),
  timeZone: z.string(),
  current: nutritionGoalSchema.nullable(),
  history: z.array(nutritionGoalSchema),
});

const pagedEntriesSchema = z.object({
  items: z.array(nutritionEntrySchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  hasNextPage: z.boolean(),
});

export type NutritionItem = z.infer<typeof nutritionItemSchema>;
export type NutritionEntry = z.infer<typeof nutritionEntrySchema>;
export type NutritionTotals = z.infer<typeof nutritionTotalsSchema>;
export type NutritionGoal = z.infer<typeof nutritionGoalSchema>;
export type NutritionDay = z.infer<typeof nutritionDaySchema>;
export type NutritionMealGroup = NutritionDay['meals'][number];
export type NutritionGoals = z.infer<typeof nutritionGoalsSchema>;
export type PagedNutritionEntries = z.infer<typeof pagedEntriesSchema>;

/** One food item as it is sent to the API: the inputs only, never the computed totals. */
export interface NutritionItemInput {
  name: string;
  quantityMode: QuantityMode;
  quantity: number;
  energyKcalPerUnit: number;
  proteinGramsPerUnit: number;
  carbGramsPerUnit: number;
  fatGramsPerUnit: number;
}

export interface NutritionEntryInput {
  mealType: MealType;
  consumedAtUtc: string;
  note: string | null;
  items: NutritionItemInput[];
}

export interface NutritionGoalInput {
  /** Local date the targets start applying from; omitted means today in the profile time zone. */
  effectiveFrom?: string;
  energyKcal: number | null;
  proteinGrams: number | null;
  carbGrams: number | null;
  fatGrams: number | null;
}

export interface NutritionEntryFilters {
  date?: string;
  from?: string;
  to?: string;
  mealType?: MealType;
}

function query(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== '');
  if (entries.length === 0) {
    return '';
  }
  return '?' + entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
}

const auth = { auth: true } as const;

export const nutritionApi = {
  day: (date: string | undefined, signal?: AbortSignal) =>
    apiRequest(`/api/nutrition/day${query({ date })}`, { ...auth, schema: nutritionDaySchema, signal }),

  listEntries: (filters: NutritionEntryFilters, pageNumber: number, pageSize = 20, signal?: AbortSignal) =>
    apiRequest(`/api/nutrition/entries${query({ ...filters, pageNumber, pageSize })}`, { ...auth, schema: pagedEntriesSchema, signal }),
  getEntry: (id: string, signal?: AbortSignal) => apiRequest(`/api/nutrition/entries/${id}`, { ...auth, schema: nutritionEntrySchema, signal }),
  createEntry: (input: NutritionEntryInput, clientRequestId: string) =>
    apiRequest('/api/nutrition/entries', { ...auth, method: 'POST', body: { ...input, clientRequestId }, schema: nutritionEntrySchema }),
  updateEntry: (id: string, input: NutritionEntryInput) =>
    apiRequest(`/api/nutrition/entries/${id}`, { ...auth, method: 'PUT', body: input, schema: nutritionEntrySchema }),
  deleteEntry: (id: string) => apiRequest(`/api/nutrition/entries/${id}`, { ...auth, method: 'DELETE' }),

  goals: (signal?: AbortSignal) => apiRequest('/api/nutrition/goals', { ...auth, schema: nutritionGoalsSchema, signal }),
  /** Returns the saved goal, or null when the call cleared every target (the API answers 204). */
  saveGoal: async (input: NutritionGoalInput): Promise<NutritionGoal | null> =>
    (await apiRequest('/api/nutrition/goals', { ...auth, method: 'PUT', body: input, schema: nutritionGoalSchema })) ?? null,
};
