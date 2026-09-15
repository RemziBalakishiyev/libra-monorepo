import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { FoodPhotoScreen } from '@/screens/nutrition/photo-analysis';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { analysisDraft, breakfastEntry, emptyAnalysisDraft } from '@/test/nutrition-fixtures';

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: mockReplace, back: mockBack, canGoBack: () => true }),
}));

const mockPickPhoto = jest.fn();
jest.mock('@/lib/photo-picker', () => ({
  cameraAvailable: true,
  pickPhoto: (source: string) => mockPickPhoto(source),
}));

const photo = { uri: 'file:///meal.jpg', fileName: 'meal.jpg', mimeType: 'image/jpeg', width: 1024, height: 768 };

interface Call {
  path: string;
  method: string;
  multipart: boolean;
  body: Record<string, unknown> | undefined;
}

describe('FoodPhotoScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockBack.mockReset();
    mockReplace.mockReset();
    fetchMock.mockReset();
    mockPickPhoto.mockReset();
    mockPickPhoto.mockResolvedValue({ kind: 'picked', photo });
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-08T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-08T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  /** Answers the two photo-analysis endpoints and records every request the screen makes. */
  function mockApi({
    analyze = () => jsonResponse(analysisDraft, 201),
    confirm = () => jsonResponse({ ...breakfastEntry, id: 'entry-from-photo' }, 201),
  }: { analyze?: (attempt: number) => Promise<Response> | Response; confirm?: (attempt: number) => Promise<Response> | Response } = {}) {
    let analyses = 0;
    let confirmations = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const multipart = typeof FormData !== 'undefined' && init?.body instanceof FormData;
      const body = init?.body && !multipart ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', multipart, body });

      if (url.pathname === '/api/nutrition/food-analysis' && init?.method === 'POST') {
        analyses += 1;
        return analyze(analyses);
      }
      if (url.pathname.endsWith('/confirm') && init?.method === 'POST') {
        confirmations += 1;
        return confirm(confirmations);
      }
      if (url.pathname.startsWith('/api/nutrition/food-analysis/') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      throw new TypeError(`No mock for ${init?.method ?? 'GET'} ${url.pathname}`);
    });
  }

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <FoodPhotoScreen date="2026-09-07" />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  /** Picks a photo and runs the analysis, leaving the screen on whatever state the answer produced. */
  async function analyzePhoto(view: Awaited<ReturnType<typeof render>>) {
    await fireEvent.press(view.getByTestId('pick-library'));
    await waitFor(() => view.getByTestId('photo-preview'));
    await fireEvent.press(view.getByTestId('analyze-photo'));
  }

  it('sends nothing until the picture is explicitly analyzed', async () => {
    mockApi();
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('pick-library'));

    await waitFor(() => view.getByTestId('photo-preview'));
    expect(calls).toHaveLength(0);
    // The upload is announced before it happens, not after.
    expect(view.getByText(/AI ilə qiymətləndirilməsi üçün Libra serverinə göndərilir/)).toBeTruthy();
  });

  it('shows the estimate as an editable review and still writes nothing', async () => {
    mockApi();
    const view = await renderScreen();

    await analyzePhoto(view);

    await waitFor(() => view.getByTestId('food-photo-review'));
    expect(view.getByTestId('item-name-0').props.value).toBe('Omlet');
    // A pictured portion is one portion; the estimated weight never becomes a second multiplier.
    expect(view.getByTestId('item-quantity-0').props.value).toBe('1');
    expect(view.getByTestId('item-energy-0').props.value).toBe('250');
    // A per-100 g estimate carries the weight as the quantity.
    expect(view.getByTestId('item-quantity-1').props.value).toBe('180');
    expect(view.getByTestId('item-energy-1').props.value).toBe('130');
    expect(view.getAllByText('AI təxmini').length).toBeGreaterThan(0);
    expect(view.getByTestId('analysis-notes')).toHaveTextContent(/kadrdan kənardadır/);

    expect(calls.map((call) => call.path)).toEqual(['/api/nutrition/food-analysis']);
    expect(calls[0]!.multipart).toBe(true);
  });

  it('leaves a nutrient the model could not judge empty and refuses to confirm it', async () => {
    mockApi();
    const view = await renderScreen();

    await analyzePhoto(view);
    await waitFor(() => view.getByTestId('food-photo-review'));

    expect(view.getByTestId('item-protein-1').props.value).toBe('');

    await fireEvent.press(view.getByTestId('confirm-analysis'));

    await waitFor(() => expect(view.getByText('Dəyər daxil edin (0 da yazıla bilər).')).toBeTruthy());
    // Nothing was written: the only request so far is the analysis itself.
    expect(calls.filter((call) => call.path.endsWith('/confirm'))).toHaveLength(0);
  });

  it('confirms exactly what the user reviewed, once', async () => {
    mockApi();
    const view = await renderScreen();

    await analyzePhoto(view);
    await waitFor(() => view.getByTestId('food-photo-review'));

    await fireEvent.changeText(view.getByTestId('item-protein-1'), '2,7');
    await fireEvent.changeText(view.getByTestId('item-quantity-1'), '90');
    await fireEvent.press(view.getByTestId('confirm-analysis'));

    await waitFor(() => expect(calls.filter((call) => call.path.endsWith('/confirm'))).toHaveLength(1));
    const confirmed = calls.find((call) => call.path.endsWith('/confirm'))!;
    expect(confirmed.path).toBe('/api/nutrition/food-analysis/draft-1/confirm');
    const items = confirmed.body!.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ name: 'Düyü', quantityMode: 'Per100Grams', quantity: 90, proteinGramsPerUnit: 2.7 });
    expect(confirmed.body!.clientRequestId).toEqual(expect.any(String));

    // The screen returns to the diary once, with a single toast on the destination.
    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
  });

  it('keeps the edits when a confirmation fails and retries under the same key', async () => {
    mockApi({
      confirm: (attempt) => (attempt === 1 ? jsonResponse({ title: 'Server error' }, 500) : jsonResponse({ ...breakfastEntry, id: 'entry-from-photo' }, 201)),
    });
    const view = await renderScreen();

    await analyzePhoto(view);
    await waitFor(() => view.getByTestId('food-photo-review'));

    await fireEvent.changeText(view.getByTestId('item-protein-1'), '2,7');
    await fireEvent.changeText(view.getByTestId('item-name-0'), 'Kükürtlü omlet');
    await fireEvent.press(view.getByTestId('confirm-analysis'));

    await waitFor(() => expect(view.getByTestId('item-name-0').props.value).toBe('Kükürtlü omlet'));
    const confirmations = () => calls.filter((call) => call.path.endsWith('/confirm'));
    await waitFor(() => expect(confirmations()).toHaveLength(1));

    await fireEvent.press(view.getByTestId('confirm-analysis'));
    await waitFor(() => expect(confirmations()).toHaveLength(2));

    // The retry carries the first attempt's key, so a lost response can never become a second meal.
    expect(confirmations()[1]!.body!.clientRequestId).toBe(confirmations()[0]!.body!.clientRequestId);
    expect(confirmations()[1]!.body!.items).toEqual(confirmations()[0]!.body!.items);
  });

  it('ignores an answer that belongs to a photo the user already replaced', async () => {
    let release: ((response: Response) => void) | undefined;
    mockApi({
      analyze: (attempt) =>
        attempt === 1
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : jsonResponse({ ...analysisDraft, id: 'draft-2' }, 201),
    });
    const view = await renderScreen();

    await analyzePhoto(view);
    await waitFor(() => expect(calls).toHaveLength(1));

    // A second picture replaces the first while its analysis is still running.
    mockPickPhoto.mockResolvedValue({ kind: 'picked', photo: { ...photo, uri: 'file:///other.jpg' } });
    await fireEvent.press(view.getByTestId('pick-library'));
    await waitFor(() => expect(view.getByTestId('photo-preview').props.source.uri).toBe('file:///other.jpg'));

    await act(async () => {
      release!(await jsonResponse(analysisDraft, 201));
    });

    // The stale answer never opens a review for the picture that is no longer on screen.
    expect(view.queryByTestId('food-photo-review')).toBeNull();
    expect(view.getByTestId('food-photo-screen')).toBeTruthy();
  });

  it.each([
    ['NoFoodDetected' as const, 'Şəkildə yemək yoxdur.', /Şəkildə yemək tapılmadı/],
    ['InsufficientInformation' as const, 'Şəkil çox bulanıqdır.', /kifayət etmədi/],
  ])('explains a picture it could not estimate from (%s)', async (outcome, notes, expected) => {
    mockApi({ analyze: () => jsonResponse(emptyAnalysisDraft(outcome, notes), 201) });
    const view = await renderScreen();

    await analyzePhoto(view);

    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
    expect(view.queryByTestId('food-photo-review')).toBeNull();
    expect(view.getByTestId('pick-library')).toBeTruthy();
  });

  it.each([
    [503, /Təhlil xidməti əlçatan deyil/],
    [504, /Təhlil çox uzun çəkdi/],
    [429, /Çox sayda təhlil/],
    [413, /Şəkil çox böyükdür/],
  ])('reports a %s from the analysis honestly', async (status, expected) => {
    mockApi({ analyze: () => jsonResponse({ title: 'Photo analysis failed', detail: undefined }, status) });
    const view = await renderScreen();

    await analyzePhoto(view);

    await waitFor(() => expect(view.getByText(expected)).toBeTruthy());
    expect(view.queryByTestId('food-photo-review')).toBeNull();
  });

  it('reports a lost connection without pretending anything was saved', async () => {
    mockApi({
      analyze: () => {
        throw new TypeError('Network request failed');
      },
    });
    const view = await renderScreen();

    await analyzePhoto(view);

    await waitFor(() => expect(view.getByText(/Serverə qoşulmaq mümkün olmadı/)).toBeTruthy());
  });

  it('explains a denied camera permission and keeps the manual form one tap away', async () => {
    mockApi();
    mockPickPhoto.mockResolvedValue({ kind: 'denied', source: 'camera', canAskAgain: false });
    const view = await renderScreen();

    await fireEvent.press(view.getByTestId('pick-camera'));

    await waitFor(() => expect(view.getByText(/Kameraya icazə verilmədi/)).toBeTruthy());
    await fireEvent.press(view.getByTestId('photo-manual'));
    expect(mockReplace).toHaveBeenCalledWith('/nutrition/new?date=2026-09-07');
  });

  it('discards the draft when the review is cancelled', async () => {
    mockApi();
    const view = await renderScreen();

    await analyzePhoto(view);
    await waitFor(() => view.getByTestId('food-photo-review'));

    await fireEvent.press(view.getByTestId('cancel-analysis'));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/nutrition/food-analysis/draft-1')).toBe(true));
    expect(calls.filter((call) => call.path.endsWith('/confirm'))).toHaveLength(0);
    expect(view.getByTestId('food-photo-screen')).toBeTruthy();
  });
});
