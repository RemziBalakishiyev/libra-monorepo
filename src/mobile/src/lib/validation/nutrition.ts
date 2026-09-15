import { z } from 'zod';

import { mealTypeSchema, quantityModeSchema } from '@/lib/api/nutrition';
import { isIsoDate } from '@/lib/dates';
import { parseDecimalInput } from '@/lib/money';

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * A required nutrient value. An empty field is a missing value ("daxil edin"), while a typed 0 is a legitimate
 * answer, so the two are never confused.
 */
const nutrientText = z
  .string()
  .trim()
  .min(1, 'Dəyər daxil edin (0 da yazıla bilər).')
  .refine((value) => parseDecimalInput(value, 2) !== null, 'Ən çox 2 onluq rəqəm olan müsbət ədəd yazın.');

const quantityText = z
  .string()
  .trim()
  .min(1, 'Miqdar daxil edin.')
  .refine((value) => {
    const parsed = parseDecimalInput(value, 3);
    return parsed !== null && parsed > 0;
  }, 'Miqdar sıfırdan böyük olmalıdır (ən çox 3 onluq rəqəm).');

export const isoDateSchema = z.string().trim().refine(isIsoDate, 'Tarix YYYY-AA-GG formatında olmalıdır.');
export const timeSchema = z.string().trim().regex(TIME, 'Saat SS:DD formatında olmalıdır.');

export const nutritionItemFormSchema = z.object({
  name: z.string().trim().min(1, 'Yeməyin adını yazın.').max(120, 'Ad çox uzundur.'),
  quantityMode: quantityModeSchema,
  quantity: quantityText,
  energyKcal: nutrientText,
  protein: nutrientText,
  carbs: nutrientText,
  fat: nutrientText,
});

export const nutritionEntryFormSchema = z.object({
  mealType: mealTypeSchema,
  date: isoDateSchema,
  time: timeSchema,
  note: z.string().trim().max(500, 'Qeyd çox uzundur.'),
  items: z.array(nutritionItemFormSchema).min(1, 'Ən azı bir yemək əlavə edin.').max(20, 'Ən çox 20 yemək əlavə edilə bilər.'),
});

/** A target the user may leave empty; an empty field means "izlənmir", never a recommended default. */
const targetText = z
  .string()
  .trim()
  .refine((value) => {
    if (value === '') {
      return true;
    }
    const parsed = parseDecimalInput(value, 2);
    return parsed !== null && parsed > 0;
  }, 'Hədəf sıfırdan böyük olmalıdır (və ya boş buraxın).');

export const nutritionGoalFormSchema = z.object({
  energyKcal: targetText,
  protein: targetText,
  carbs: targetText,
  fat: targetText,
});

export type NutritionItemForm = z.infer<typeof nutritionItemFormSchema>;
export type NutritionEntryForm = z.infer<typeof nutritionEntryFormSchema>;
export type NutritionGoalForm = z.infer<typeof nutritionGoalFormSchema>;

/** Parses an optional target field: empty stays unset instead of becoming zero. */
export function parseTarget(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : parseDecimalInput(trimmed, 2);
}
