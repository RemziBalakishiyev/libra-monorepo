import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tasksApi, type CreateTaskInput, type TaskView, type UpdateTaskInput, type UpdateTaskSeriesInput } from '@/lib/api/tasks';

/**
 * Every task query lives under 'tasks'. A mutation invalidates the whole prefix because the three views, the
 * day summary and Home's row all describe the same rows from different angles — a completed task leaves one
 * view and joins another, and a recurring edit can touch dates none of the callers named.
 */
export const taskKeys = {
  all: ['tasks'] as const,
  day: (date: string | undefined) => ['tasks', 'day', date ?? 'today'] as const,
  list: (view: TaskView) => ['tasks', 'list', view] as const,
  task: (id: string) => ['tasks', 'item', id] as const,
};

function useInvalidateTasks() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: taskKeys.all });
}

/** One local calendar day: its counts, its tasks, and what is still owed from earlier days. */
export function useTaskDay(date?: string) {
  return useQuery({
    queryKey: taskKeys.day(date),
    queryFn: ({ signal }) => tasksApi.day(date, signal),
  });
}

export function useTaskList(view: TaskView, enabled = true) {
  return useInfiniteQuery({
    queryKey: taskKeys.list(view),
    queryFn: ({ pageParam, signal }) => tasksApi.list(view, pageParam, 20, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.pageNumber + 1 : undefined),
    enabled,
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: taskKeys.task(id ?? ''),
    queryFn: ({ signal }) => tasksApi.get(id!, signal),
    enabled: Boolean(id),
  });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    // The same id travels with every retry of one form, so a double tap cannot create two tasks.
    mutationFn: ({ input, clientRequestId }: { input: CreateTaskInput; clientRequestId: string }) => tasksApi.create(input, clientRequestId),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) => tasksApi.update(id, input),
    onSuccess: () => invalidate(),
  });
}

/**
 * Sets the completion state. The request carries the state the user asked for, so a retry after a lost response
 * lands on the same value; the cache is refreshed from the server's answer rather than assumed.
 */
export function useSetTaskCompletion() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => tasksApi.setCompletion(id, completed),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => tasksApi.remove(id),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTaskSeries() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskSeriesInput }) => tasksApi.updateSeries(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useStopTaskSeries() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => tasksApi.stopSeries(id),
    onSuccess: () => invalidate(),
  });
}
