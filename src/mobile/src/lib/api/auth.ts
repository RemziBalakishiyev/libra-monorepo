import { z } from 'zod';

import { apiRequest } from '@/lib/api/client';
import { useSessionStore, type SessionTokens } from '@/lib/session-store';

export const authSessionSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAtUtc: z.string(),
  refreshToken: z.string().min(1),
  refreshTokenExpiresAtUtc: z.string(),
});

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function register(input: RegisterInput): Promise<SessionTokens> {
  const tokens = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: { email: input.email, password: input.password, displayName: input.displayName || undefined },
    schema: authSessionSchema,
  });
  await useSessionStore.getState().setTokens(tokens);
  return tokens;
}

export async function login(input: LoginInput): Promise<SessionTokens> {
  const tokens = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: input,
    schema: authSessionSchema,
  });
  await useSessionStore.getState().setTokens(tokens);
  return tokens;
}

/**
 * Revokes the current session family on the server, then forgets it locally.
 * Local sign-out always completes, even if the server call fails (offline, already revoked).
 */
export async function logout(): Promise<void> {
  const store = useSessionStore.getState();
  const refreshToken = store.tokens?.refreshToken;
  try {
    if (refreshToken) {
      await apiRequest('/api/auth/logout', { method: 'POST', body: { refreshToken }, auth: true });
    }
  } catch {
    // Ignore: the refresh token expires on its own and the client no longer holds it.
  } finally {
    await store.clear();
  }
}
