import { useLocalSearchParams } from 'expo-router';

import { NutritionEntryFormScreen } from '@/screens/nutrition/entry-form';

export default function EditNutritionEntryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <NutritionEntryFormScreen id={id} />;
}
