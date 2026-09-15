import { useLocalSearchParams } from 'expo-router';

import { DebtDetailScreen } from '@/screens/finance/debt-detail';

export default function DebtRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DebtDetailScreen id={id} />;
}
