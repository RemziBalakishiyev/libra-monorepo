/**
 * Nutrition helpers shared by the diary, the entry form and the Home summary.
 *
 * The API is the source of truth for stored totals; the functions here mirror its arithmetic so the form can
 * show what an item will contribute while the user is still typing. Energy is never derived from the macros:
 * a label's kcal is what the user entered.
 */

import type { MealType, NutritionItemInput, NutritionTotals, QuantityMode } from '@/lib/api/nutrition';
import type { IconName } from '@/constants/categories';
import { formatNumber } from '@/lib/money';

export const emptyTotals: NutritionTotals = { energyKcal: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0 };

interface MealDefinition {
  type: MealType;
  label: string;
  /** Fits four segments on a 360 pt phone; the full label stays the accessible name. */
  shortLabel: string;
  icon: IconName;
  /** Hours (local) this meal is the natural default for. */
  hours: [number, number];
}

/** Meal groups in diary order, with the Azerbaijani labels used everywhere in the module. */
export const meals: readonly MealDefinition[] = [
  { type: 'Breakfast', label: 'Səhər yeməyi', shortLabel: 'Səhər', icon: 'sunny-outline', hours: [4, 10] },
  { type: 'Lunch', label: 'Nahar', shortLabel: 'Nahar', icon: 'restaurant-outline', hours: [11, 15] },
  { type: 'Dinner', label: 'Axşam yeməyi', shortLabel: 'Axşam', icon: 'moon-outline', hours: [16, 21] },
  { type: 'Snack', label: 'Ara yemək', shortLabel: 'Ara', icon: 'cafe-outline', hours: [22, 3] },
];

export function mealLabel(type: MealType): string {
  return meals.find((meal) => meal.type === type)?.label ?? type;
}

export function mealIcon(type: MealType): IconName {
  return meals.find((meal) => meal.type === type)?.icon ?? 'restaurant-outline';
}

/** The meal a new entry starts on when it is opened from the header rather than from a group. */
export function mealForHour(hour: number): MealType {
  for (const meal of meals) {
    const [start, end] = meal.hours;
    if (start <= end ? hour >= start && hour <= end : hour >= start || hour <= end) {
      return meal.type;
    }
  }
  return 'Snack';
}

/** Multiplier the entered nutrients are scaled by: portions as-is, grams divided by 100 (mirrors the API). */
export function quantityMultiplier(mode: QuantityMode, quantity: number): number {
  return mode === 'Per100Grams' ? quantity / 100 : quantity;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** What one item contributes. Computed from the entered values and rounded once, like the server does. */
export function itemTotals(input: NutritionItemInput): NutritionTotals {
  const multiplier = quantityMultiplier(input.quantityMode, input.quantity);
  return {
    energyKcal: round2(input.energyKcalPerUnit * multiplier),
    proteinGrams: round2(input.proteinGramsPerUnit * multiplier),
    carbGrams: round2(input.carbGramsPerUnit * multiplier),
    fatGrams: round2(input.fatGramsPerUnit * multiplier),
  };
}

export function sumTotals(totals: readonly NutritionTotals[]): NutritionTotals {
  return totals.reduce<NutritionTotals>(
    (accumulator, current) => ({
      energyKcal: round2(accumulator.energyKcal + current.energyKcal),
      proteinGrams: round2(accumulator.proteinGrams + current.proteinGrams),
      carbGrams: round2(accumulator.carbGrams + current.carbGrams),
      fatGrams: round2(accumulator.fatGrams + current.fatGrams),
    }),
    emptyTotals,
  );
}

/** "695 kkal" — energy is shown as a whole number; the stored value keeps its decimals. */
export function formatKcal(value: number, withUnit = true): string {
  return `${formatNumber(value, 0)}${withUnit ? ' kkal' : ''}`;
}

/** "40,1 q" — macros keep one decimal so a small item never reads as zero. */
export function formatGrams(value: number, withUnit = true): string {
  return `${formatNumber(value, 1)}${withUnit ? ' q' : ''}`;
}

/** The quantity as the user entered it: "2 porsiya", "0,5 porsiya", "150 q". */
export function formatQuantity(mode: QuantityMode, quantity: number): string {
  if (mode === 'Per100Grams') {
    return `${formatNumber(quantity, Number.isInteger(quantity) ? 0 : 1)} q`;
  }
  const rounded = Number.isInteger(quantity) ? formatNumber(quantity, 0) : formatNumber(quantity, quantity * 100 % 10 === 0 ? 2 : 3);
  return `${rounded} porsiya`;
}

export interface TargetProgress {
  target: number;
  consumed: number;
  /** Consumed share of the target, clamped for the bar; the figures stay exact. */
  percent: number;
  /** Positive: still available. Negative: over the target. */
  remaining: number;
  over: boolean;
}

/**
 * Progress against a target. Returns null when no target is set, so a screen shows the consumed amount and an
 * action to configure one instead of a percentage of nothing.
 */
export function targetProgress(consumed: number, target: number | null | undefined): TargetProgress | null {
  if (target === null || target === undefined || target <= 0) {
    return null;
  }
  const remaining = round2(target - consumed);
  return {
    target,
    consumed,
    percent: Math.min(100, Math.max(0, (consumed / target) * 100)),
    remaining,
    over: remaining < 0,
  };
}

/** "230 kkal qalıb" / "120 kkal artıq" — the actual difference, never a hidden overflow. */
export function energyDifferenceLabel(progress: TargetProgress): string {
  return progress.over ? `${formatKcal(Math.abs(progress.remaining))} artıq` : `${formatKcal(progress.remaining)} qalıb`;
}

export function gramsDifferenceLabel(progress: TargetProgress): string {
  return progress.over ? `${formatGrams(Math.abs(progress.remaining))} artıq` : `${formatGrams(progress.remaining)} qalıb`;
}

/** The three macros in display order, with their token names. Screens never hard-code a macro colour. */
export const macroKinds = [
  { key: 'protein', label: 'Zülal', short: 'Z', fill: 'protein', text: 'proteinText' },
  { key: 'carb', label: 'Karbohidrat', short: 'K', fill: 'carb', text: 'carbText' },
  { key: 'fat', label: 'Yağ', short: 'Y', fill: 'fat', text: 'fatText' },
] as const satisfies readonly { key: string; label: string; short: string; fill: MacroColorToken; text: MacroColorToken }[];

type MacroColorToken = 'protein' | 'proteinText' | 'carb' | 'carbText' | 'fat' | 'fatText';

export type MacroKind = (typeof macroKinds)[number];

/** The three macro figures of a totals record, paired with their definition. */
export function macroBreakdown(totals: NutritionTotals, goal: { proteinGrams: number | null; carbGrams: number | null; fatGrams: number | null } | null | undefined) {
  const consumed = { protein: totals.proteinGrams, carb: totals.carbGrams, fat: totals.fatGrams } as const;
  const target = { protein: goal?.proteinGrams, carb: goal?.carbGrams, fat: goal?.fatGrams } as const;
  return macroKinds.map((macro) => ({
    ...macro,
    value: consumed[macro.key],
    // Each macro goal is independently optional: an untracked one still reports its recorded grams.
    progress: targetProgress(consumed[macro.key], target[macro.key]),
  }));
}

/**
 * The share of the target a ring should draw: clamped to 0–100 so an exceeded target cannot wrap the arc, while
 * the exact consumed and exceeded figures stay readable next to it. Reaching the target is not a completion
 * state, so nothing here reports "done".
 */
export function ringPercent(progress: TargetProgress | null): number {
  return progress ? Math.min(100, Math.max(0, progress.percent)) : 0;
}

/** Whole-percent label for the ring's centre; null when there is no target to be a share of. */
export function ringLabel(progress: TargetProgress | null): string | null {
  return progress ? `${Math.round((progress.consumed / progress.target) * 100)}%` : null;
}

/** Entry name for lists: the first item, plus how many more the meal held. */
export function describeEntry(items: readonly { name: string }[]): string {
  if (items.length === 0) {
    return 'Yemək';
  }
  const [first, ...rest] = items;
  return rest.length === 0 ? first!.name : `${first!.name} +${rest.length}`;
}
