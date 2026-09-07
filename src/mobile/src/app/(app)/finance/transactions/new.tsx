import { useLocalSearchParams } from 'expo-router';

import { TransactionFormScreen } from '@/screens/finance/transaction-form';

export default function NewTransactionRoute() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  return <TransactionFormScreen initialType={type === 'Income' ? 'Income' : 'Expense'} />;
}
