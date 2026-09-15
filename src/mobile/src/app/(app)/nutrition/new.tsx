import { useLocalSearchParams } from 'expo-router';

import type { MealType } from '@/lib/api/nutrition';
import { mealTypeSchema } from '@/lib/api/nutrition';
import { NutritionEntryFormScreen } from '@/screens/nutrition/entry-form';

export default function NewNutritionEntryRoute() {
  const { date, mealType, copyFrom } = useLocalSearchParams<{ date?: string; mealType?: string; copyFrom?: string }>();
  const meal = mealTypeSchema.safeParse(mealType);
  return <NutritionEntryFormScreen date={date} mealType={meal.success ? (meal.data as MealType) : undefined} copyFromId={copyFrom} />;
}
