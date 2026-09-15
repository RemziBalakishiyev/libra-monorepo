import { useLocalSearchParams } from 'expo-router';

import type { DebtDirection } from '@/lib/api/debts';
import { DebtFormScreen } from '@/screens/finance/debt-form';

export default function NewDebtRoute() {
  const { direction } = useLocalSearchParams<{ direction?: DebtDirection }>();
  return <DebtFormScreen direction={direction === 'Payable' ? 'Payable' : direction === 'Receivable' ? 'Receivable' : undefined} />;
}
