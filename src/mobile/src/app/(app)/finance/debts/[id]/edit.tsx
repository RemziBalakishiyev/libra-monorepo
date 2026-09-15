import { useLocalSearchParams } from 'expo-router';

import { DebtFormScreen } from '@/screens/finance/debt-form';

export default function EditDebtRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebtFormScreen id={id} />;
}
