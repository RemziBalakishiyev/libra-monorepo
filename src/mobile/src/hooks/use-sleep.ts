import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { sleepApi, type CorrectSleepInput, type RecordSleepInput } from '@/lib/api/sleep';

/**
 * Every sleep query lives under 'sleep'. A mutation invalidates the whole prefix because the running session,
 * the week's summary and the history all describe the same rows from different angles — closing a night moves
 * it from one to the others.
 */
export const sleepKeys = {
  all: ['sleep'] as const,
  active: () => ['sleep', 'active'] as const,
  summary: (date: string | undefined) => ['sleep', 'summary', date ?? 'today'] as const,
  history: () => ['sleep', 'history'] as const,
  session: (id: string) => ['sleep', 'session', id] as const,
};

function useInvalidateSleep() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: sleepKeys.all });
}

/**
 * The running session. `refetchOnWindowFocus` is what makes a resume reconcile with the server rather than
 * trusting whatever the screen was showing when the app went away.
 */
export function useActiveSleep() {
  return useQuery({
    queryKey: sleepKeys.active(),
    queryFn: ({ signal }) => sleepApi.active(signal),
    refetchOnWindowFocus: true,
  });
}

export function useSleepSummary(date?: string) {
  return useQuery({
    queryKey: sleepKeys.summary(date),
    queryFn: ({ signal }) => sleepApi.summary(date, signal),
    refetchOnWindowFocus: true,
  });
}

export function useSleepHistory(pageSize = 20) {
  return useQuery({
    queryKey: sleepKeys.history(),
    queryFn: ({ signal }) => sleepApi.history(1, pageSize, signal),
  });
}

export function useSleepSession(id: string | undefined) {
  return useQuery({
    queryKey: sleepKeys.session(id ?? ''),
    queryFn: ({ signal }) => sleepApi.get(id!, signal),
    enabled: Boolean(id),
  });
}

export function useStartSleep() {
  const invalidate = useInvalidateSleep();
  return useMutation({
    // The same key travels with every retry of one press, so an uncertain answer cannot become two nights.
    mutationFn: ({ clientRequestId, startedAtUtc }: { clientRequestId: string; startedAtUtc?: string }) => sleepApi.start(clientRequestId, startedAtUtc),
    onSuccess: () => invalidate(),
  });
}

/** Closes one named session at the instant the user pressed "Oyandım", which the caller captured. */
export function useStopSleep() {
  const invalidate = useInvalidateSleep();
  return useMutation({
    mutationFn: ({ id, endedAtUtc }: { id: string; endedAtUtc: string }) => sleepApi.stop(id, endedAtUtc),
    onSuccess: () => invalidate(),
  });
}

export function useRecordSleep() {
  const invalidate = useInvalidateSleep();
  return useMutation({
    mutationFn: ({ input, clientRequestId }: { input: RecordSleepInput; clientRequestId: string }) => sleepApi.record(input, clientRequestId),
    onSuccess: () => invalidate(),
  });
}

export function useCorrectSleep() {
  const invalidate = useInvalidateSleep();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CorrectSleepInput }) => sleepApi.correct(id, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSleep() {
  const invalidate = useInvalidateSleep();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => sleepApi.remove(id),
    onSuccess: () => invalidate(),
  });
}
