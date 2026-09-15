import { useLocalSearchParams } from 'expo-router';

import type { MealType } from '@/lib/api/nutrition';
import { mealTypeSchema } from '@/lib/api/nutrition';
import { FoodPhotoScreen } from '@/screens/nutrition/photo-analysis';

export default function FoodPhotoRoute() {
  const { date, mealType } = useLocalSearchParams<{ date?: string; mealType?: string }>();
  const meal = mealTypeSchema.safeParse(mealType);
  return <FoodPhotoScreen date={date} mealType={meal.success ? (meal.data as MealType) : undefined} />;
}
