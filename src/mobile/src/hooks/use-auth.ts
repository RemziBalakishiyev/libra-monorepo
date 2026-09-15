import { useMutation, useQueryClient } from '@tanstack/react-query';

import { login, logout, register } from '@/lib/api/auth';
import type { Profile } from '@/lib/api/profile';
import { useSessionStore } from '@/lib/session-store';
import { clearPendingStopForUser } from '@/lib/sleep-pending';
import { clearRemindersForUser } from '@/lib/sleep-reminder';
import { profileQueryKey } from '@/hooks/use-profile';

/** Reactive session status for layouts and guards. */
export function useSessionStatus() {
  return useSessionStore((state) => state.status);
}

export function useLogin() {
  const queryClient = useQueryClient();
  // A sign-in can follow an expired session of another account, so the cache starts empty either way.
  return useMutation({ mutationFn: login, onSuccess: () => queryClient.clear() });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: register, onSuccess: () => queryClient.clear() });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Read before the cache is emptied: what this device kept for sleep is scoped to this user, and only
      // this user's own reminder and unsent wake-up are cleared. Nothing else scheduled on the device is
      // touched, and the server session is left exactly as it is — signing out never ends a running night.
      const userId = queryClient.getQueryData<Profile>(profileQueryKey)?.id;
      try {
        await logout();
      } finally {
        await clearRemindersForUser(userId);
        await clearPendingStopForUser(userId);
      }
    },
    onSettled: () => {
      // Forget every user-scoped query so the next account never sees stale data.
      queryClient.clear();
    },
  });
}
