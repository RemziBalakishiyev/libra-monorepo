import { useMutation, useQueryClient } from '@tanstack/react-query';

import { login, logout, register } from '@/lib/api/auth';
import { useSessionStore } from '@/lib/session-store';

/** Reactive session status for layouts and guards. */
export function useSessionStatus() {
  return useSessionStore((state) => state.status);
}

export function useLogin() {
  return useMutation({ mutationFn: login });
}

export function useRegister() {
  return useMutation({ mutationFn: register });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    onSettled: () => {
      // Forget every user-scoped query so the next account never sees stale data.
      queryClient.clear();
    },
  });
}
