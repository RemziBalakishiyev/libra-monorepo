import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { NutritionDiary } from '@/screens/nutrition/diary';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import { breakfastEntry, lunchEntry, nutritionDay, nutritionGoal } from '@/test/nutrition-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

describe('NutritionDiary', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockPush.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-08T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-08T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  function renderDiary() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NutritionDiary />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('shows the day total against the target and groups entries by meal', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay()) }));
    const view = await renderDiary();

    // 250 + 445 across two meals, summed by the API over the whole day.
    expect(await view.findByLabelText('Ümumi enerji 695 kkal')).toBeTruthy();
    expect(view.getByText('1.505 kkal qalıb')).toBeTruthy();
    expect(view.getByLabelText('Zülal: 40,1 q / 130,0 q, 90,0 q qalıb')).toBeTruthy();

    expect(view.getByText('Səhər yeməyi')).toBeTruthy();
    expect(view.getByLabelText('Səhər yeməyi cəmi 250 kkal')).toBeTruthy();
    expect(view.getByLabelText('Nahar cəmi 445 kkal')).toBeTruthy();
    // Empty groups keep one compact action instead of an empty card.
    expect(view.getAllByText('Hələ yemək yoxdur — əlavə edin')).toHaveLength(2);
  });

  it('offers a way to set a target instead of inventing one', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay([breakfastEntry], null)) }));
    const view = await renderDiary();

    expect(await view.findByLabelText('Ümumi enerji 250 kkal')).toBeTruthy();
    expect(view.queryByText(/qalıb/)).toBeNull();
    expect(view.getByLabelText('Zülal: 18,0 q, hədəf təyin edilməyib')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Hədəf təyin et' }));
    expect(mockPush).toHaveBeenCalledWith('/nutrition/goals');
  });

  it('keeps the real figure visible when the target is exceeded', async () => {
    const heavy = { ...lunchEntry, energyKcal: 2400, proteinGrams: 150 };
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay([heavy], nutritionGoal)) }));
    const view = await renderDiary();

    expect(await view.findByLabelText('Ümumi enerji 2.400 kkal')).toBeTruthy();
    expect(view.getByText('200 kkal artıq')).toBeTruthy();
    expect(view.getByLabelText('Zülal: 150,0 q / 130,0 q, 20,0 q artıq')).toBeTruthy();
  });

  it('explains an empty day and opens the form for the shown date', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay([], nutritionGoal)) }));
    const view = await renderDiary();

    expect(await view.findByText('Bu gün üçün qeyd yoxdur')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'İlk yeməyi əlavə et' }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/nutrition\/new\?date=\d{4}-\d{2}-\d{2}$/));
  });

  it('presets the meal type when adding from a group', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay()) }));
    const view = await renderDiary();

    await fireEvent.press(await view.findByLabelText('Axşam yeməyi üçün yemək əlavə et'));

    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('mealType=Dinner'));
  });

  it('opens an editable draft when copying instead of writing one immediately', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay()) }));
    const view = await renderDiary();

    await fireEvent.press(await view.findByTestId(`nutrition-entry-more-${lunchEntry.id}`));
    await fireEvent.press(await view.findByRole('button', { name: 'Başqa günə köçür' }));
    // The day after the fixture's. The label is matched by prefix because today's cell also says "bu gün",
    // and which cell that is depends on the day the suite happens to run.
    await fireEvent.press(await view.findByLabelText(/^8 sentyabr 2026/));

    // Nothing was posted: the user lands on a draft they still have to save.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledWith(`/nutrition/new?date=2026-09-08&copyFrom=${lunchEntry.id}`);
  });

  it('shows an error with retry and recovers', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(nutritionDay()) }));
    const view = await renderDiary();

    expect(await view.findByText('Serverə qoşulmaq mümkün olmadı')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));

    expect(await view.findByLabelText('Ümumi enerji 695 kkal')).toBeTruthy();
  });
});
