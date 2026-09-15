import type { FoodAnalysisDraft } from '@/lib/api/food-analysis';
import type { MealType, NutritionDay, NutritionEntry, NutritionGoal, NutritionGoals, NutritionItem } from '@/lib/api/nutrition';

export const omeletItem: NutritionItem = {
  id: 'item-omelet',
  name: 'Omlet',
  quantityMode: 'PerPortion',
  quantity: 1,
  energyKcalPerUnit: 250,
  proteinGramsPerUnit: 18,
  carbGramsPerUnit: 3,
  fatGramsPerUnit: 19,
  energyKcal: 250,
  proteinGrams: 18,
  carbGrams: 3,
  fatGrams: 19,
  position: 0,
};

export const riceItem: NutritionItem = {
  id: 'item-rice',
  name: 'Düyü',
  quantityMode: 'Per100Grams',
  quantity: 150,
  energyKcalPerUnit: 130,
  proteinGramsPerUnit: 2.7,
  carbGramsPerUnit: 28.2,
  fatGramsPerUnit: 0.3,
  energyKcal: 195,
  proteinGrams: 4.05,
  carbGrams: 42.3,
  fatGrams: 0.45,
  position: 1,
};

export const breakfastEntry: NutritionEntry = {
  id: 'entry-breakfast',
  mealType: 'Breakfast',
  consumedAtUtc: '2026-09-07T05:30:00Z',
  note: null,
  clientRequestId: null,
  energyKcal: 250,
  proteinGrams: 18,
  carbGrams: 3,
  fatGrams: 19,
  items: [omeletItem],
  createdAtUtc: '2026-09-07T05:30:00Z',
  updatedAtUtc: '2026-09-07T05:30:00Z',
};

export const lunchEntry: NutritionEntry = {
  id: 'entry-lunch',
  mealType: 'Lunch',
  consumedAtUtc: '2026-09-07T09:15:00Z',
  note: 'iş yerində',
  clientRequestId: null,
  energyKcal: 445,
  proteinGrams: 22.05,
  carbGrams: 45.3,
  fatGrams: 19.45,
  items: [omeletItem, riceItem],
  createdAtUtc: '2026-09-07T09:15:00Z',
  updatedAtUtc: '2026-09-07T09:15:00Z',
};

export const nutritionGoal: NutritionGoal = {
  id: 'goal-1',
  effectiveFrom: '2026-09-01',
  energyKcal: 2200,
  proteinGrams: 130,
  carbGrams: 250,
  fatGrams: 70,
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-09-01T00:00:00Z',
};

const mealOrder: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

/** Builds a day response from entries, summing exactly like the API does. */
export function nutritionDay(entries: NutritionEntry[] = [breakfastEntry, lunchEntry], goal: NutritionGoal | null = nutritionGoal, date = '2026-09-07'): NutritionDay {
  const sum = (pick: (entry: NutritionEntry) => number, list: NutritionEntry[]) => Math.round(list.reduce((total, entry) => total + pick(entry), 0) * 100) / 100;
  const totalsOf = (list: NutritionEntry[]) => ({
    energyKcal: sum((entry) => entry.energyKcal, list),
    proteinGrams: sum((entry) => entry.proteinGrams, list),
    carbGrams: sum((entry) => entry.carbGrams, list),
    fatGrams: sum((entry) => entry.fatGrams, list),
  });

  return {
    date,
    timeZone: 'Asia/Baku',
    startUtc: '2026-09-06T20:00:00Z',
    endUtc: '2026-09-07T20:00:00Z',
    totals: totalsOf(entries),
    entryCount: entries.length,
    goal,
    meals: mealOrder.map((mealType) => {
      const group = entries.filter((entry) => entry.mealType === mealType);
      return { mealType, totals: totalsOf(group), entries: group };
    }),
  };
}

export function nutritionGoals(current: NutritionGoal | null = nutritionGoal, date = '2026-09-07'): NutritionGoals {
  return { date, timeZone: 'Asia/Baku', current, history: current ? [current] : [] };
}

/**
 * A photo-analysis draft with one food on each basis, plus one nutrient the model could not judge. It covers
 * both normalization paths and the "missing, not zero" case in a single fixture.
 */
export const analysisDraft: FoodAnalysisDraft = {
  id: 'draft-1',
  status: 'PendingConfirmation',
  outcome: 'Success',
  schemaVersion: 'food-analysis.v1',
  model: 'fixture/food-analysis',
  notes: 'Boşqabın bir hissəsi kadrdan kənardadır.',
  confidence: 0.6,
  imageId: 'image-1',
  hasImage: true,
  createdAtUtc: '2026-09-07T09:00:00Z',
  expiresAtUtc: '2026-09-07T11:00:00Z',
  isExpired: false,
  confirmedEntryId: null,
  items: [
    {
      id: 'analysis-omelet',
      name: 'Omlet',
      portionDescription: 'bir boşqab',
      estimatedGrams: 180,
      basis: 'PicturedPortion',
      energyKcal: 250,
      proteinGrams: 18,
      carbGrams: 3,
      fatGrams: 19,
      confidence: 0.7,
      position: 0,
      suggestedQuantityMode: 'PerPortion',
      suggestedQuantity: 1,
      suggestedEnergyKcalPerUnit: 250,
      suggestedProteinGramsPerUnit: 18,
      suggestedCarbGramsPerUnit: 3,
      suggestedFatGramsPerUnit: 19,
      isComplete: true,
    },
    {
      id: 'analysis-rice',
      name: 'Düyü',
      portionDescription: 'yarım kasa',
      estimatedGrams: 180,
      basis: 'Per100Grams',
      energyKcal: 130,
      proteinGrams: null,
      carbGrams: 28.2,
      fatGrams: 0.3,
      confidence: 0.5,
      position: 1,
      suggestedQuantityMode: 'Per100Grams',
      suggestedQuantity: 180,
      suggestedEnergyKcalPerUnit: 130,
      suggestedProteinGramsPerUnit: null,
      suggestedCarbGramsPerUnit: 28.2,
      suggestedFatGramsPerUnit: 0.3,
      isComplete: false,
    },
  ],
};

/** The same draft with nothing to estimate, for the unclear-picture and no-food states. */
export function emptyAnalysisDraft(outcome: FoodAnalysisDraft['outcome'], notes: string): FoodAnalysisDraft {
  return { ...analysisDraft, id: `draft-${outcome}`, outcome, notes, confidence: 0.1, items: [] };
}
