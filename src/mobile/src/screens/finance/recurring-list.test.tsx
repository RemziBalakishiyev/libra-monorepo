import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { RecurringListScreen } from '@/screens/finance/recurring-list';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import { monthOf, rentPending, rentRecorded, rentTransaction } from '@/test/recurring-debt-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

describe('RecurringListScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T09:00:00Z'));
    mockPush.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({
      accessToken: 'access',
      accessTokenExpiresAtUtc: '2026-09-16T00:00:00Z',
      refreshToken: 'refresh',
      refreshTokenExpiresAtUtc: '2026-10-06T00:00:00Z',
    });
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
  });

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RecurringListScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('shows the pending month without posting anything, then records once with one clientRequestId', async () => {
    let recorded = false;
    const posts: { path: string; body: { clientRequestId: string; amount: number; accountId: string; occurredOn: string } }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(init.body as string) });
        recorded = true;
        return jsonResponse({ occurrence: rentRecorded, transaction: rentTransaction }, 201);
      }
      if (path === '/api/finance/recurring') {
        return jsonResponse(monthOf([recorded ? rentRecorded : rentPending]));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    expect(await view.findByTestId('recurring-row-tpl-rent')).toBeTruthy();
    expect(view.getByTestId('recurring-status-tpl-rent')).toHaveTextContent('Gözləyir');
    // Only reads so far: opening the month must not post money.
    expect(posts).toHaveLength(0);
    expect(view.getByTestId('recurring-pending-total')).toHaveTextContent(/450,00/);

    await fireEvent.press(view.getByTestId('recurring-record-tpl-rent'));
    const sheet = await view.findByTestId('record-sheet');
    expect(sheet).toBeTruthy();
    // The review shows the effect on the chosen account before anything is confirmed.
    expect((await view.findByTestId('record-effect')).props.accessibilityLabel).toMatch(/250,50 AZN → −199,50 AZN/);
    expect(posts).toHaveLength(0);

    await fireEvent.press(view.getByTestId('record-confirm'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe('/api/finance/recurring/templates/tpl-rent/occurrences/2026/9/record');
    expect(posts[0]!.body.amount).toBe(450);
    expect(posts[0]!.body.accountId).toBe('acc-cash');
    // Due on the 30th but confirmed on the 15th: the actual date defaults to today, not the future due date.
    expect(posts[0]!.body.occurredOn).toBe('2026-09-15');
    expect(posts[0]!.body.clientRequestId).toMatch(/[0-9a-f-]{36}/);

    await waitFor(() => expect(view.getByTestId('recurring-status-tpl-rent')).toHaveTextContent('Qeyd olunub'));
    expect(view.getByTestId('recurring-recorded-total')).toHaveTextContent(/450,00/);
    await fireEvent.press(view.getByTestId('recurring-open-tpl-rent'));
    expect(mockPush).toHaveBeenCalledWith('/finance/transactions/tx-rent');
  });

  it('keeps the typed review values and reuses the key when the confirmation fails and is retried', async () => {
    let attempts = 0;
    const bodies: { clientRequestId: string; amount: number }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        attempts += 1;
        bodies.push(JSON.parse(init.body as string));
        if (attempts === 1) {
          throw new TypeError('Network request failed');
        }
        return jsonResponse({ occurrence: { ...rentRecorded, amount: 440 }, transaction: { ...rentTransaction, amount: 440 } }, 201);
      }
      if (path === '/api/finance/recurring') {
        return jsonResponse(monthOf([attempts >= 2 ? { ...rentRecorded, amount: 440 } : rentPending]));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByTestId('recurring-record-tpl-rent'));
    await view.findByTestId('record-sheet');
    await fireEvent.changeText(view.getByTestId('record-amount'), '440');

    await fireEvent.press(view.getByTestId('record-confirm'));
    expect(await view.findByText('Serverə qoşulmaq mümkün olmadı. Bağlantını yoxlayıb yenidən cəhd edin.')).toBeTruthy();
    // The sheet stays open with the edited amount.
    expect(view.getByTestId('record-amount').props.value).toBe('440');

    await fireEvent.press(view.getByTestId('record-confirm'));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]!.clientRequestId).toBe(bodies[1]!.clientRequestId);
    expect(bodies[1]!.amount).toBe(440);
    await waitFor(() => expect(view.queryByTestId('record-sheet')).toBeNull());
  });

  it('shows a conflict from the server inside the sheet instead of losing the review', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        return jsonResponse({ title: 'Already recorded', status: 409, detail: 'Bu ay artıq qeyd olunub.' }, 409);
      }
      if (path === '/api/finance/recurring') {
        return jsonResponse(monthOf([rentPending]));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByTestId('recurring-record-tpl-rent'));
    await view.findByTestId('record-sheet');
    await fireEvent.press(view.getByTestId('record-confirm'));

    expect(await view.findByText('Bu ay artıq qeyd olunub.')).toBeTruthy();
    expect(view.getByTestId('record-sheet')).toBeTruthy();
  });

  it('undoes a recorded month after confirmation and refreshes the list', async () => {
    let undone = false;
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST' && path.endsWith('/undo')) {
        undone = true;
        return jsonResponse({ ...rentRecorded, status: 'Skipped', transactionId: null });
      }
      if (path === '/api/finance/recurring') {
        return jsonResponse(monthOf([undone ? { ...rentRecorded, status: 'Skipped', transactionId: null } : rentRecorded]));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByTestId('recurring-undo-tpl-rent'));

    await waitFor(() => expect(view.getByTestId('recurring-status-tpl-rent')).toHaveTextContent('Buraxılıb'));
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/occurrences/2026/9/undo'))).toBe(true);
  });

  it('shows the empty month, the error state with retry, and navigates between months', async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/finance/recurring') {
        calls += 1;
        return calls === 1 ? jsonResponse({ title: 'Server error', status: 500 }, 500) : jsonResponse({ ...monthOf([]), month: 10 });
      }
      return jsonResponse([cashAccount]);
    });

    const view = await renderScreen();
    expect(await view.findByText('Serverdə xəta baş verdi')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));
    expect(await view.findByText('Bu ay üçün plan yoxdur')).toBeTruthy();

    await fireEvent.press(view.getByTestId('recurring-next'));
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('year=2026&month=10'));
    expect(view.getByTestId('recurring-period').props.accessibilityLabel).toMatch(/oktyabr/i);
  });

  it('opens the create form from the header', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/finance/recurring': () => jsonResponse(monthOf([])), '/api/finance/accounts': () => jsonResponse([cashAccount]) }));
    const view = await renderScreen();
    await fireEvent.press(await view.findByTestId('recurring-add'));
    expect(mockPush).toHaveBeenCalledWith('/finance/recurring/new');
  });
});
