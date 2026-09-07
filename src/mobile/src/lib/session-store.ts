import { create } from 'zustand';

import { secureStorage } from '@/lib/secure-storage';

export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAtUtc: string;
  refreshToken: string;
  refreshTokenExpiresAtUtc: string;
}

interface SessionState {
  status: SessionStatus;
  tokens: SessionTokens | null;
  /** Reads persisted tokens once at startup. */
  restore: () => Promise<void>;
  /** Persists a new token pair (login, register, refresh). */
  setTokens: (tokens: SessionTokens) => Promise<void>;
  /** Forgets the session locally. Server-side revocation is the caller's job. */
  clear: () => Promise<void>;
}

const STORAGE_KEY = 'libra.session';

/**
 * Client-only auth state. Server data (profile) stays in TanStack Query; this store holds just the tokens
 * and whether the app should show the signed-in or signed-out route group.
 */
export const useSessionStore = create<SessionState>((set) => ({
  status: 'loading',
  tokens: null,

  async restore() {
    const tokens = await readTokens();
    set({ status: tokens ? 'signedIn' : 'signedOut', tokens });
  },

  async setTokens(tokens) {
    set({ status: 'signedIn', tokens });
    await secureStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  },

  async clear() {
    set({ status: 'signedOut', tokens: null });
    await secureStorage.deleteItem(STORAGE_KEY);
  },
}));

async function readTokens(): Promise<SessionTokens | null> {
  try {
    const raw = await secureStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isSessionTokens(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSessionTokens(value: unknown): value is SessionTokens {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.accessTokenExpiresAtUtc === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    typeof candidate.refreshTokenExpiresAtUtc === 'string'
  );
}
