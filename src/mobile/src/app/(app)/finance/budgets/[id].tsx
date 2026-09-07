import { useLocalSearchParams } from 'expo-router';

import { BudgetFormScreen } from '@/screens/finance/budget-form';

export default function EditBudgetRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BudgetFormScreen id={id} />;
}
