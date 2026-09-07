import { useLocalSearchParams } from 'expo-router';

import { TransferFormScreen } from '@/screens/finance/transfer-form';

export default function EditTransferRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TransferFormScreen id={id} />;
}
