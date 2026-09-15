import { useLocalSearchParams } from 'expo-router';

import { TaskFormScreen } from '@/screens/plan/task-form';

export default function NewTaskRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return <TaskFormScreen date={date} />;
}
