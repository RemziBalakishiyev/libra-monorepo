import type { SessionStatus } from '@/lib/session-store';

/** Which route group the root layout exposes for a session status. Exactly one group is visible once loaded. */
export function routeGuards(status: SessionStatus): { app: boolean; auth: boolean } {
  return { app: status === 'signedIn', auth: status === 'signedOut' };
}
