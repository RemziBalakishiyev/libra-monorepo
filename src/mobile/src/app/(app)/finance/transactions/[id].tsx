import { useLocalSearchParams } from 'expo-router';

import { TransactionFormScreen } from '@/screens/finance/transaction-form';

export default function EditTransactionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransactionFormScreen id={id} />;
}
