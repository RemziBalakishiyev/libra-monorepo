import { useLocalSearchParams } from 'expo-router';

import { RecurringFormScreen } from '@/screens/finance/recurring-form';

export default function EditRecurringRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <RecurringFormScreen id={id} />;
}
