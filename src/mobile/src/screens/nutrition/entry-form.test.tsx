import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { NutritionEntryFormScreen } from '@/screens/nutrition/entry-form';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { breakfastEntry, lunchEntry } from '@/test/nutrition-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('NutritionEntryFormScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockBack.mockReset();
    fetchMock.mockReset();
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-08T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-08T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  /** Records every request and answers the entry endpoints; `onCreate` can override the POST response. */
  function mockApi({ entries = {}, onCreate }: { entries?: Record<string, unknown>; onCreate?: (attempt: number) => Response } = {}) {
    let attempts = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });

      const match = /^\/api\/nutrition\/entries\/(.+)$/.exec(url.pathname);
      if (match && (init?.method ?? 'GET') === 'GET') {
        const entry = entries[match[1]!];
        return entry ? jsonResponse(entry) : jsonResponse({ title: 'Nutrition entry not found' }, 404);
      }
      if (url.pathname === '/api/nutrition/entries' && init?.method === 'POST') {
        attempts += 1;
        return onCreate ? onCreate(attempts) : jsonResponse({ ...breakfastEntry, id: 'entry-new' }, 201);
      }
      if (match && init?.method === 'PUT') {
        return jsonResponse({ ...lunchEntry, ...(body ?? {}) });
      }
      if (match && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new TypeError(`No mock for ${init?.method ?? 'GET'} ${url.pathname}`);
    });
  }

  function renderForm(props: Parameters<typeof NutritionEntryFormScreen>[0] = {}) {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <NutritionEntryFormScreen {...props} />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  async function fillItem(view: Awaited<ReturnType<typeof render>>, values: { name?: string; quantity?: string; energy?: string; protein?: string; carbs?: string; fat?: string } = {}) {
    await fireEvent.changeText(view.getByTestId('item-name-0'), values.name ?? 'Omlet');
    await fireEvent.changeText(view.getByTestId('item-quantity-0'), values.quantity ?? '1');
    await fireEvent.changeText(view.getByTestId('item-energy-0'), values.energy ?? '250');
    await fireEvent.changeText(view.getByTestId('item-protein-0'), values.protein ?? '18');
    await fireEvent.changeText(view.getByTestId('item-carbs-0'), values.carbs ?? '3');
    await fireEvent.changeText(view.getByTestId('item-fat-0'), values.fat ?? '19');
  }

  const posts = () => calls.filter((call) => call.path === '/api/nutrition/entries' && call.method === 'POST');

  it('keeps the calculation in step with the quantity and the entry mode', async () => {
    mockApi();
    const view = await renderForm({ date: '2026-09-07' });

    // A single food has one live total; its own contribution line would only repeat it.
    expect(view.queryByTestId('item-total-0')).toBeNull();
    expect(view.getByTestId('item-basis-0')).toHaveTextContent('Dəyərlər 1 porsiya üçündür');

    await fillItem(view);
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('250');
    expect(view.getByTestId('entry-total-macros')).toHaveTextContent(/Zülal 18,0 q/);

    await fireEvent.changeText(view.getByTestId('item-quantity-0'), '2,5');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('625');
    expect(view.getByTestId('entry-total-macros')).toHaveTextContent(/Karbohidrat 7,5 q/);
    expect(view.getByTestId('entry-total-macros')).toHaveTextContent(/Yağ 47,5 q/);

    // Switching to per-100 g reads the same numbers as "per 100 g" and the weight in grams.
    await fireEvent.press(view.getByRole('radio', { name: '100 q üzrə' }));
    expect(view.getByTestId('item-basis-0')).toHaveTextContent('Dəyərlər 100 q üçündür');
    await fireEvent.changeText(view.getByTestId('item-quantity-0'), '150');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('375');
    expect(view.getByLabelText(/^Çəki \(q\)/)).toBeTruthy();
  });

  it('shows a dash until an item is complete, and never a zero-calorie meal that was not entered', async () => {
    mockApi();
    const view = await renderForm({ date: '2026-09-07' });

    // Nothing typed: no total is claimed.
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('—');
    expect(view.getByTestId('entry-total-macros')).toHaveTextContent(/Zülal —/);
    expect(view.getByTestId('entry-total-incomplete')).toHaveTextContent('Dəyərlər tam deyil — bütün xanaları doldurun.');

    // Half-typed: still incomplete, still no figure.
    await fireEvent.changeText(view.getByTestId('item-name-0'), 'Omlet');
    await fireEvent.changeText(view.getByTestId('item-energy-0'), '250');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('—');

    // An explicitly typed zero is a value: the total is real and reads zero.
    await fireEvent.changeText(view.getByTestId('item-energy-0'), '0');
    await fireEvent.changeText(view.getByTestId('item-protein-0'), '0');
    await fireEvent.changeText(view.getByTestId('item-carbs-0'), '0');
    await fireEvent.changeText(view.getByTestId('item-fat-0'), '0');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('0');
    expect(view.queryByTestId('entry-total-incomplete')).toBeNull();
  });

  it('keeps every macro field and a full total at enlarged text', async () => {
    // At 1.5× the three macro inputs stop sharing a row; nothing may be dropped or abbreviated for space.
    const fontScale = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1.5);
    try {
      mockApi();
      const view = await renderForm({ date: '2026-09-07' });

      expect(view.getByLabelText(/^Zülal \(q\)/)).toBeTruthy();
      // "Karbohidrat" is the label most at risk of being cut; it stays whole.
      expect(view.getByLabelText(/^Karbohidrat \(q\)/)).toBeTruthy();
      expect(view.getByLabelText(/^Yağ \(q\)/)).toBeTruthy();
      // The meal segments drop their icons rather than their names when the text grows.
      for (const meal of ['Səhər yeməyi', 'Nahar', 'Axşam yeməyi', 'Ara yemək']) {
        expect(view.getByRole('radio', { name: meal })).toBeTruthy();
      }

      await fillItem(view, { energy: '1234,5', protein: '123,4' });
      expect(view.getByTestId('entry-total-energy')).toHaveTextContent('1.235');
      expect(view.getByTestId('entry-total-macros')).toHaveTextContent(/Karbohidrat 3,0 q/);
    } finally {
      fontScale.mockRestore();
    }
  });

  it('reports a missing value next to the field and does not submit', async () => {
    mockApi();
    const view = await renderForm();

    await fireEvent.changeText(view.getByTestId('item-name-0'), 'Omlet');
    await fireEvent.press(view.getByTestId('nutrition-submit'));

    // Every missing nutrient is flagged next to its own field; the quantity starts at a visible 1 portion.
    expect(await view.findAllByText('Dəyər daxil edin (0 da yazıla bilər).')).toHaveLength(4);
    expect(view.getByTestId('item-quantity-0')).toHaveProp('value', '1');
    expect(posts()).toHaveLength(0);
  });

  it('accepts an explicit zero and sends the entered values unchanged', async () => {
    mockApi();
    const view = await renderForm({ date: '2026-09-07' });

    await fillItem(view, { name: 'Qara qəhvə', energy: '2', protein: '0', carbs: '0', fat: '0' });
    await fireEvent.press(view.getByTestId('nutrition-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const item = (posts()[0]!.body!.items as Record<string, unknown>[])[0]!;
    expect(item).toMatchObject({ name: 'Qara qəhvə', quantityMode: 'PerPortion', quantity: 1, energyKcalPerUnit: 2, proteinGramsPerUnit: 0, carbGramsPerUnit: 0, fatGramsPerUnit: 0 });
    // The consumed instant keeps the diary's date.
    expect(String(posts()[0]!.body!.consumedAtUtc)).toContain('2026-09-0');
  });

  it('parses comma decimals into numbers', async () => {
    mockApi();
    const view = await renderForm();

    await fillItem(view, { quantity: '0,5', protein: '18,25' });
    await fireEvent.press(view.getByTestId('nutrition-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const item = (posts()[0]!.body!.items as Record<string, unknown>[])[0]!;
    expect(item.quantity).toBe(0.5);
    expect(item.proteinGramsPerUnit).toBe(18.25);
  });

  it('sends one idempotency key and ignores a second tap while saving', async () => {
    mockApi();
    const view = await renderForm();

    await fillItem(view);
    await fireEvent.press(view.getByTestId('nutrition-submit'));
    await fireEvent.press(view.getByTestId('nutrition-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]!.body!.clientRequestId).toEqual(expect.any(String));
  });

  it('keeps the typed values after a failed request and retries with the same key', async () => {
    mockApi({ onCreate: (attempt) => (attempt === 1 ? jsonResponse({ title: 'Server error' }, 500) : jsonResponse({ ...breakfastEntry, id: 'entry-new' }, 201)) });
    const view = await renderForm();

    await fillItem(view, { name: 'Omlet', quantity: '2' });
    await fireEvent.press(view.getByTestId('nutrition-submit'));

    expect(await view.findByText('Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.')).toBeTruthy();
    // Nothing was cleared, so nothing has to be typed twice.
    expect(view.getByTestId('item-name-0').props.value).toBe('Omlet');
    expect(view.getByTestId('item-quantity-0').props.value).toBe('2');
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('nutrition-submit'));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[0]!.body!.clientRequestId).toBe(posts()[1]!.body!.clientRequestId);
  });

  it('adds and removes food items', async () => {
    mockApi();
    const view = await renderForm();

    await fillItem(view);
    await fireEvent.press(view.getByTestId('add-item'));
    expect(view.getByTestId('item-editor-1')).toBeTruthy();

    await fireEvent.changeText(view.getByTestId('item-name-1'), 'Düyü');
    await fireEvent.changeText(view.getByTestId('item-energy-1'), '130');
    await fireEvent.changeText(view.getByTestId('item-protein-1'), '2,7');
    await fireEvent.changeText(view.getByTestId('item-carbs-1'), '28,2');
    await fireEvent.changeText(view.getByTestId('item-fat-1'), '0,3');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('380');
    // With several foods each keeps its own contribution line beside the meal total.
    expect(view.getByTestId('item-total-0')).toHaveTextContent('Bu yemək: 250 kkal · Z 18,0 q · K 3,0 q · Y 19,0 q');
    expect(view.getByTestId('item-total-1')).toHaveTextContent(/130 kkal/);

    await fireEvent.press(view.getByTestId('item-remove-1'));
    expect(view.queryByTestId('item-editor-1')).toBeNull();
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('250');
  });

  it('leaves a half-filled extra food out of the total and says so', async () => {
    mockApi();
    const view = await renderForm();

    await fillItem(view);
    await fireEvent.press(view.getByTestId('add-item'));
    await fireEvent.changeText(view.getByTestId('item-name-1'), 'Düyü');
    await fireEvent.changeText(view.getByTestId('item-energy-1'), '130');

    // The complete food still counts; the unfinished one is excluded and named, not silently zeroed.
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('250');
    expect(view.getByTestId('entry-total-incomplete')).toHaveTextContent('1 yeməyin dəyərləri tam deyil; cəmə daxil edilməyib.');
    expect(view.getByTestId('item-total-1')).toHaveTextContent('Bu yemək: — (dəyərlər tam deyil)');
  });

  it('prefills an edit from the stored snapshot and saves the edited quantity', async () => {
    mockApi({ entries: { [lunchEntry.id]: lunchEntry } });
    const view = await renderForm({ id: lunchEntry.id });

    // The per-unit inputs come back exactly as they were entered, not the computed totals.
    expect(await view.findByTestId('item-name-0')).toHaveProp('value', 'Omlet');
    expect(view.getByTestId('item-energy-0')).toHaveProp('value', '250');
    expect(view.getByTestId('item-name-1')).toHaveProp('value', 'Düyü');
    expect(view.getByTestId('item-quantity-1')).toHaveProp('value', '150');
    expect(view.getByTestId('item-energy-1')).toHaveProp('value', '130');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('445');

    await fireEvent.changeText(view.getByTestId('item-quantity-1'), '200');
    expect(view.getByTestId('entry-total-energy')).toHaveTextContent('510');

    await fireEvent.press(view.getByTestId('nutrition-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    const items = calls.find((call) => call.method === 'PUT')!.body!.items as Record<string, unknown>[];
    expect(items[1]).toMatchObject({ quantityMode: 'Per100Grams', quantity: 200, energyKcalPerUnit: 130 });
    expect(posts()).toHaveLength(0);
  });

  it('opens a copy as an editable draft and creates a separate entry', async () => {
    mockApi({ entries: { [lunchEntry.id]: lunchEntry } });
    const view = await renderForm({ copyFromId: lunchEntry.id, date: '2026-09-08' });

    // The header renders while the source loads, so wait for the prefilled field itself.
    expect(await view.findByTestId('item-name-0')).toHaveProp('value', 'Omlet');
    expect(view.getByText('Yeməyin nüsxəsi')).toBeTruthy();
    expect(view.getByText('Nüsxə ayrıca qeyd kimi yaradılacaq; ilkin yemək dəyişmir.')).toBeTruthy();
    // Opening the action wrote nothing.
    expect(posts()).toHaveLength(0);

    await fireEvent.press(view.getByTestId('nutrition-submit'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    // A plain create: the source entry is never updated.
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
    expect((posts()[0]!.body!.items as unknown[])).toHaveLength(2);
  });
});
