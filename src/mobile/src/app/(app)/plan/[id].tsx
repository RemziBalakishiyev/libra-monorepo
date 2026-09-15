import { useLocalSearchParams } from 'expo-router';

import { TaskFormScreen } from '@/screens/plan/task-form';

export default function TaskRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TaskFormScreen id={id} />;
}
