import { useLocalSearchParams } from 'expo-router';

import { CategoryFormScreen } from '@/screens/finance/category-form';

export default function EditCategoryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CategoryFormScreen id={id} />;
}
