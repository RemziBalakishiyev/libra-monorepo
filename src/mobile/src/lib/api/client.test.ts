import { z } from 'zod';

import { ApiError, apiRequest } from '@/lib/api/client';
import { useSessionStore, type SessionTokens } from '@/lib/session-store';

const initialTokens: SessionTokens = {
  accessToken: 'old-access',
  accessTokenExpiresAtUtc: '2026-09-05T10:15:00Z',
  refreshToken: 'old-refresh',
  refreshTokenExpiresAtUtc: '2026-10-05T10:00:00Z',
};

const renewedTokens: SessionTokens = {
  accessToken: 'new-access',
  accessTokenExpiresAtUtc: '2026-09-05T10:30:00Z',
  refreshToken: 'new-refresh',
  refreshTokenExpiresAtUtc: '2026-10-05T10:15:00Z',
};

const okSchema = z.object({ ok: z.boolean() });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

function unauthorized(): Response {
  return json({ title: 'Unauthorized', status: 401 }, 401);
}

function authHeader(call: [RequestInfo | URL, RequestInit?]): string | undefined {
  return (call[1]?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('apiRequest', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(async () => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens(initialTokens);
  });

  it('attaches the bearer token and parses the response with the schema', async () => {
    fetchMock.mockResolvedValueOnce(json({ ok: true }));

    const result = await apiRequest('/api/profile', { auth: true, schema: okSchema });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authHeader(fetchMock.mock.calls[0]!)).toBe('Bearer old-access');
  });

  it('refreshes once and retries the original request after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json(renewedTokens))
      .mockResolvedValueOnce(json({ ok: true }));

    const result = await apiRequest('/api/profile', { auth: true, schema: okSchema });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]![0])).toBe('http://localhost:5134/api/auth/refresh');
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual({ refreshToken: 'old-refresh' });
    expect(authHeader(fetchMock.mock.calls[2]!)).toBe('Bearer new-access');
    expect(useSessionStore.getState().tokens).toEqual(renewedTokens);
  });

  it('clears the session and throws when the refresh is rejected', async () => {
    fetchMock.mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(unauthorized());

    await expect(apiRequest('/api/profile', { auth: true, schema: okSchema })).rejects.toMatchObject<Partial<ApiError>>({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useSessionStore.getState().status).toBe('signedOut');
    expect(useSessionStore.getState().tokens).toBeNull();
  });

  it('shares a single refresh between concurrent 401 responses', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/auth/refresh')) {
        return json(renewedTokens);
      }
      const bearer = (init?.headers as Record<string, string>).Authorization;
      return bearer === 'Bearer new-access' ? json({ ok: true }) : unauthorized();
    });

    const results = await Promise.all([
      apiRequest('/api/profile', { auth: true, schema: okSchema }),
      apiRequest('/api/profile', { auth: true, schema: okSchema }),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const refreshCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/api/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('converts problem details into ApiError without refreshing for non-401 failures', async () => {
    fetchMock.mockResolvedValueOnce(json({ title: 'Email is already registered', status: 409 }, 409));

    await expect(apiRequest('/api/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject<Partial<ApiError>>({
      status: 409,
      title: 'Email is already registered',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
