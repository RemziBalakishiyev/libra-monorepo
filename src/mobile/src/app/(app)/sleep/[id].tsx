import { useLocalSearchParams } from 'expo-router';

import { SleepFormScreen } from '@/screens/sleep/session-form';

export default function SleepSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SleepFormScreen id={id} />;
}
