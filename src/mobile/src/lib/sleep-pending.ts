import { secureStorage } from '@/lib/secure-storage';

/**
 * The wake-up the user recorded but the server has not confirmed yet.
 *
 * "Oyandım" captures one instant. If the request fails, that instant is kept here — scoped to the user and the
 * exact session it belongs to — so a retry minutes or hours later records when they actually woke, never when
 * the connection came back. It is a single record on purpose, not a queue: one user has one running session.
 */
export interface PendingStop {
  userId: string;
  sessionId: string;
  /** The captured wake instant, ISO-8601 UTC. */
  endedAtUtc: string;
}

const STORAGE_KEY = 'libra.sleep.pending-stop';

export async function readPendingStop(): Promise<PendingStop | null> {
  try {
    const raw = await secureStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isPendingStop(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writePendingStop(pending: PendingStop): Promise<void> {
  await secureStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

export async function clearPendingStop(): Promise<void> {
  await secureStorage.deleteItem(STORAGE_KEY);
}

/**
 * The pending stop that applies right now, or null. A record for another user or another session is stale —
 * the session it named is already closed, or belongs to an account that is no longer signed in — so it is
 * discarded rather than applied to whatever happens to be running.
 */
export function pendingStopFor(pending: PendingStop | null, userId: string | undefined, sessionId: string | undefined): PendingStop | null {
  if (!pending || !userId || !sessionId) {
    return null;
  }
  return pending.userId === userId && pending.sessionId === sessionId ? pending : null;
}

function isPendingStop(value: unknown): value is PendingStop {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.userId === 'string' && typeof candidate.sessionId === 'string' && typeof candidate.endedAtUtc === 'string';
}

/**
 * Drops this device's pending wake-up on logout. A record belonging to another account is left alone, so
 * signing out of one user never discards what a different one is still waiting to send.
 */
export async function clearPendingStopForUser(userId: string | undefined): Promise<void> {
  const stored = await readPendingStop();
  if (stored && (!userId || stored.userId === userId)) {
    await clearPendingStop();
  }
}
