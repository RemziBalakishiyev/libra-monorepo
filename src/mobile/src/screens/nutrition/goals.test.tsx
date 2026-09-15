import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { NutritionGoalsScreen } from '@/screens/nutrition/goals';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import { nutritionGoal, nutritionGoals } from '@/test/nutrition-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

describe('NutritionGoalsScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let saved: Record<string, unknown> | undefined;

  beforeEach(async () => {
    fetchMock.mockReset();
    saved = undefined;
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-08T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-08T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  function mockGoals(current = nutritionGoal as typeof nutritionGoal | null) {
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/nutrition/goals' && init?.method === 'PUT') {
        saved = JSON.parse(String(init.body)) as Record<string, unknown>;
        return saved.energyKcal === null && saved.proteinGrams === null && saved.carbGrams === null && saved.fatGrams === null
          ? new Response(null, { status: 204 })
          : jsonResponse({ ...nutritionGoal, ...saved, effectiveFrom: '2026-09-07' });
      }
      return fetchByPath({ '/api/nutrition/goals': () => jsonResponse(nutritionGoals(current)) })(input);
    });
  }

  function renderGoals() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NutritionGoalsScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('says when a change takes effect and keeps the history of earlier targets', async () => {
    mockGoals();
    const view = await renderGoals();

    expect(await view.findByText(/7 sentyabr 2026 tarixindən etibarən qüvvəyə minir/)).toBeTruthy();
    expect(view.getByText(/Əvvəlki günlər öz hədəfləri ilə qalır/)).toBeTruthy();
    expect(view.getByTestId('goal-energyKcal')).toHaveProp('value', '2200');
    expect(view.getByText('1 sentyabr 2026')).toBeTruthy();
    expect(view.getByText('Hazırda qüvvədədir')).toBeTruthy();
  });

  it('starts empty when nothing is configured and marks untracked targets', async () => {
    mockGoals(null);
    const view = await renderGoals();

    expect(await view.findByTestId('goal-energyKcal')).toHaveProp('value', '');
    expect(view.getAllByText('İzlənmir')).toHaveLength(4);
    expect(view.queryByText('Tarixçə')).toBeNull();
  });

  it('saves entered targets and leaves the untouched ones unset', async () => {
    mockGoals(null);
    const view = await renderGoals();

    await fireEvent.changeText(await view.findByTestId('goal-energyKcal'), '2200');
    await fireEvent.changeText(view.getByTestId('goal-protein'), '130,5');
    await fireEvent.press(view.getByTestId('goals-submit'));

    await waitFor(() => expect(saved).toBeDefined());
    expect(saved).toEqual({ energyKcal: 2200, proteinGrams: 130.5, carbGrams: null, fatGrams: null });
  });

  it('rejects a zero target next to the field', async () => {
    mockGoals(null);
    const view = await renderGoals();

    await fireEvent.changeText(await view.findByTestId('goal-energyKcal'), '0');
    await fireEvent.press(view.getByTestId('goals-submit'));

    expect(await view.findByText('Hədəf sıfırdan böyük olmalıdır (və ya boş buraxın).')).toBeTruthy();
    expect(saved).toBeUndefined();
  });

  it('clears every target when the fields are emptied', async () => {
    mockGoals();
    const view = await renderGoals();

    for (const field of ['goal-energyKcal', 'goal-protein', 'goal-carbs', 'goal-fat']) {
      await fireEvent.changeText(await view.findByTestId(field), '');
    }
    await fireEvent.press(view.getByTestId('goals-submit'));

    await waitFor(() => expect(saved).toEqual({ energyKcal: null, proteinGrams: null, carbGrams: null, fatGrams: null }));
  });
});
