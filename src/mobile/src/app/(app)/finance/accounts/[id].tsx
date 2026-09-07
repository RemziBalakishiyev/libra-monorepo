import { useLocalSearchParams } from 'expo-router';

import { AccountFormScreen } from '@/screens/finance/account-form';

export default function EditAccountRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AccountFormScreen id={id} />;
}
