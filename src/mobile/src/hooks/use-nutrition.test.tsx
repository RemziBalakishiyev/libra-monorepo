import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { nutritionKeys, useDeleteNutritionEntry, useUpdateNutritionEntry } from '@/hooks/use-nutrition';
import { useSessionStore } from '@/lib/session-store';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { lunchEntry } from '@/test/nutrition-fixtures';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

describe('nutrition mutations', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  const client = createTestQueryClient();

  beforeEach(async () => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-08T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-08T00:00:00Z' });
    client.clear();
  });

  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  const input = { mealType: 'Lunch' as const, consumedAtUtc: '2026-09-08T09:00:00Z', note: null, items: [] };

  /** The query keys a mutation asked to refresh. */
  function invalidatedKeys(spy: jest.SpyInstance): unknown[][] {
    return spy.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
  }

  it('refreshes both the day an entry left and the day it moved to', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(lunchEntry));
    const spy = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useUpdateNutritionEntry(), { wrapper });
    await result.current.mutateAsync({ id: lunchEntry.id, input, dates: ['2026-09-07', '2026-09-08'] });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const keys = invalidatedKeys(spy);
    expect(keys).toContainEqual(nutritionKeys.day('2026-09-07'));
    expect(keys).toContainEqual(nutritionKeys.day('2026-09-08'));
    spy.mockRestore();
  });

  it('refreshes the whole nutrition space after a delete, which is what Home reads', async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const spy = jest.spyOn(client, 'invalidateQueries');

    const { result } = await renderHook(() => useDeleteNutritionEntry(), { wrapper });
    await result.current.mutateAsync({ id: lunchEntry.id, dates: ['2026-09-07'] });

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const keys = invalidatedKeys(spy);
    // Home's summary is the "today" day query, which sits under the same prefix.
    expect(keys).toContainEqual(nutritionKeys.all);
    expect(keys).toContainEqual(nutritionKeys.day('2026-09-07'));
    spy.mockRestore();
  });

  it('keys days separately so switching dates never mixes data', () => {
    expect(nutritionKeys.day('2026-09-07')).not.toEqual(nutritionKeys.day('2026-09-08'));
    expect(nutritionKeys.day(undefined)).toEqual(['nutrition', 'day', 'today']);
  });
});
