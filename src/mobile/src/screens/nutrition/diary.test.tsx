import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { dateFromIso, isoDateOf, todayIsoDate } from '@/lib/dates';
import { useSessionStore } from '@/lib/session-store';
import { NutritionDiary } from '@/screens/nutrition/diary';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import type { NutritionGoal } from '@/lib/api/nutrition';
import { breakfastEntry, lunchEntry, nutritionDay, nutritionGoal, omeletItem, riceItem } from '@/test/nutrition-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

// Days whose label reads "Bu gün" must be dated today; the copy test keeps the fixture's own date.
const TODAY = todayIsoDate();
const shiftDay = (iso: string, days: number) => {
  const base = dateFromIso(iso);
  return isoDateOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 12));
};
const today = (entries = [breakfastEntry, lunchEntry], goal: NutritionGoal | null = nutritionGoal) => nutritionDay(entries, goal, TODAY);

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
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today()) }));
    const view = await renderDiary();

    // 250 + 445 across two meals, summed by the API over the whole day.
    expect(await view.findByLabelText('Bu gün: 695 kkal, hədəf 2.200 kkal, 1.505 kkal qalıb')).toBeTruthy();
    expect(view.getByTestId('nutrition-energy')).toHaveTextContent('695');
    expect(view.getByTestId('nutrition-energy-difference')).toHaveTextContent('1.505 kkal qalıb');
    expect(view.getByLabelText('Zülal: 40,1 q / 130,0 q, 90,0 q qalıb')).toBeTruthy();
    // The ring draws the real share of the real target: 695 of 2.200.
    expect(view.getByLabelText('Kalori hədəfi: 695 kkal / 2.200 kkal')).toBeTruthy();

    expect(view.getByText('Səhər yeməyi')).toBeTruthy();
    expect(view.getByLabelText('Səhər yeməyi cəmi 250 kkal')).toBeTruthy();
    expect(view.getByLabelText('Nahar cəmi 445 kkal')).toBeTruthy();
    // Empty groups keep one compact row instead of an empty card.
    expect(view.getAllByText('Qeyd yoxdur — əlavə edin')).toHaveLength(2);
    // Nothing on a populated day claims the day is empty, and the bowl is never a meal's thumbnail.
    expect(view.queryByTestId('nutrition-empty-note')).toBeNull();
    expect(view.queryByTestId('nutrition-empty-illustration', { includeHiddenElements: true })).toBeNull();
  });

  it('keeps an untracked macro reporting its grams without inventing progress', async () => {
    // Energy and protein are tracked; carbohydrate and fat are not.
    const partial = { ...nutritionGoal, carbGrams: null, fatGrams: null };
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today([breakfastEntry], partial)) }));
    const view = await renderDiary();

    expect(await view.findByLabelText('Zülal: 18,0 q / 130,0 q, 112,0 q qalıb')).toBeTruthy();
    expect(view.getByLabelText('Karbohidrat: 3,0 q, hədəf təyin edilməyib')).toBeTruthy();
    expect(view.getByLabelText('Yağ: 19,0 q, hədəf təyin edilməyib')).toBeTruthy();
    // The energy target is still tracked, so the ring and its figures stay.
    expect(view.getByLabelText('Kalori hədəfi: 250 kkal / 2.200 kkal')).toBeTruthy();
  });

  it('offers a way to set a target instead of inventing one', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today([breakfastEntry], null)) }));
    const view = await renderDiary();

    expect(await view.findByLabelText('Bu gün: 250 kkal, hədəf təyin edilməyib')).toBeTruthy();
    expect(view.queryByText(/qalıb/)).toBeNull();
    // No target means no ring and no percentage of nothing.
    expect(view.queryByTestId('nutrition-ring')).toBeNull();
    expect(view.getByLabelText('Zülal: 18,0 q, hədəf təyin edilməyib')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Hədəf təyin et' }));
    expect(mockPush).toHaveBeenCalledWith('/nutrition/goals');
  });

  it('keeps the real figure visible when the target is exceeded', async () => {
    const heavy = { ...lunchEntry, energyKcal: 2400, proteinGrams: 150 };
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today([heavy], nutritionGoal)) }));
    const view = await renderDiary();

    expect(await view.findByLabelText('Bu gün: 2.400 kkal, hədəf 2.200 kkal, 200 kkal artıq')).toBeTruthy();
    expect(view.getByTestId('nutrition-energy-difference')).toHaveTextContent('200 kkal artıq');
    // The exceeded figure stays exact; the ring is the clamped share and never a completion badge.
    expect(view.getByTestId('nutrition-ring')).toHaveTextContent('109%');
    expect(view.getByLabelText('Zülal: 150,0 q / 130,0 q, 20,0 q artıq')).toBeTruthy();
  });

  it('explains an empty day once, keeps the four groups, and opens the form for the shown date', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today([], nutritionGoal)) }));
    const view = await renderDiary();

    // One short explanation in the summary and one above the groups — not a page-sized empty state.
    expect(await view.findByTestId('nutrition-empty-note')).toBeTruthy();
    expect(view.getByTestId('nutrition-empty-note-line')).toBeTruthy();
    // The bowl is decorative: it is not in the accessibility tree at all, and only a query that deliberately
    // includes hidden elements can reach it. The slot is sized before the bitmap decodes.
    expect(view.queryByTestId('nutrition-empty-illustration')).toBeNull();
    const illustration = view.getByTestId('nutrition-empty-illustration', { includeHiddenElements: true });
    expect(illustration.props.accessible).toBe(false);
    expect(illustration.props.style).toMatchObject({ width: 88, height: 88 });
    expect(illustration.props.resizeMode).toBe('contain');
    // The recorded figure is a real zero, and the four groups are still there to add into.
    expect(view.getByTestId('nutrition-energy')).toHaveTextContent('0');
    expect(view.getAllByText('Qeyd yoxdur — əlavə edin')).toHaveLength(4);

    await fireEvent.press(view.getByRole('button', { name: 'Yemək əlavə et' }));
    expect(mockPush).toHaveBeenCalledWith(expect.stringMatching(/^\/nutrition\/new\?date=\d{4}-\d{2}-\d{2}$/));
  });

  it('moves between days with the week strip and never offers a future day', async () => {
    const seen: string[] = [];
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/nutrition/day') {
        const date = url.searchParams.get('date');
        seen.push(date ?? 'today');
        return jsonResponse(today());
      }
      throw new TypeError(`No mock for ${url.pathname}`);
    });
    const view = await renderDiary();
    await view.findByTestId('nutrition-summary');

    const yesterday = shiftDay(TODAY, -1);
    const tomorrow = shiftDay(TODAY, 1);

    // Seven cells ending on today; tomorrow is not one of them.
    expect(view.getByTestId(`week-day-${TODAY}`)).toBeTruthy();
    expect(view.queryByTestId(`week-day-${tomorrow}`)).toBeNull();
    expect(view.getByTestId(`week-day-${TODAY}`)).toBeChecked();

    await fireEvent.press(view.getByTestId(`week-day-${yesterday}`));
    await waitFor(() => expect(seen).toContain(yesterday));
    expect(view.getByTestId(`week-day-${yesterday}`)).toBeChecked();
  });

  it('keeps long names and four-digit figures readable side by side', async () => {
    const longName = 'Ev şəraitində bişirilmiş toyuq döşü və tərəvəzli qarabaşaq sıyığı';
    const heavy = {
      ...lunchEntry,
      energyKcal: 1234.6,
      items: [{ ...omeletItem, name: longName }, riceItem],
    };
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today([heavy])) }));
    const view = await renderDiary();

    const row = await view.findByTestId(`nutrition-entry-${heavy.id}`);
    // The energy figure is never the thing that gets clipped, and it is grouped, not raw. It appears on the
    // row and again as the group's real total, which is the same single meal here.
    expect(view.getAllByText('1.235 kkal')).toHaveLength(2);
    // The name is one line; the rest of the row keeps its own space.
    expect(view.getByText(longName).props.numberOfLines).toBe(1);
    expect(row.props.accessibilityLabel).toContain('1.235 kkal');
    // Two foods: the row says how many rather than listing them.
    expect(view.getByText(/2 yemək/)).toBeTruthy();
  });

  it('keeps the illustration out of the loading state', async () => {
    // A day that never resolves stays a skeleton: an illustration here would read as "you ate nothing".
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const view = await renderDiary();

    expect(view.queryByTestId('nutrition-empty-illustration', { includeHiddenElements: true })).toBeNull();
    expect(view.queryByTestId('nutrition-summary')).toBeNull();
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
    // The day after the fixture's, picked in the calendar itself — the week strip shows that day too, so the
    // cell is addressed by its calendar testID rather than by a label both of them carry.
    // The shared calendar asks for an explicit confirmation of the chosen day.
    await fireEvent.press(await view.findByTestId('calendar-day-2026-09-08'));
    await fireEvent.press(view.getByTestId('calendar-confirm'));

    // Nothing was posted: the user lands on a draft they still have to save.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
    expect(mockPush).toHaveBeenCalledWith(`/nutrition/new?date=2026-09-08&copyFrom=${lunchEntry.id}`);
  });

  it('shows an error with retry and recovers', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    fetchMock.mockImplementation(fetchByPath({ '/api/nutrition/day': () => jsonResponse(today()) }));
    const view = await renderDiary();

    expect(await view.findByText('Serverə qoşulmaq mümkün olmadı')).toBeTruthy();
    // A failed request is not an empty day: no figures, and no "nothing here yet" illustration either.
    expect(view.queryByTestId('nutrition-summary')).toBeNull();
    expect(view.queryByTestId('nutrition-empty-illustration', { includeHiddenElements: true })).toBeNull();

    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));

    expect(await view.findByLabelText('Bu gün: 695 kkal, hədəf 2.200 kkal, 1.505 kkal qalıb')).toBeTruthy();
  });
});
