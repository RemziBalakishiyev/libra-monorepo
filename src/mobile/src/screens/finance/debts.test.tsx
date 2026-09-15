import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useAppearanceStore } from '@/lib/appearance-store';
import { useSessionStore } from '@/lib/session-store';
import { DebtDetailScreen } from '@/screens/finance/debt-detail';
import { DebtFormScreen } from '@/screens/finance/debt-form';
import { DebtsListScreen } from '@/screens/finance/debts-list';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, jsonResponse, usdAccount } from '@/test/finance-fixtures';
import { detailOf, pagedDebts, payable, payment100, receivable, summary } from '@/test/recurring-debt-fixtures';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack, dismissTo: jest.fn(), canGoBack: () => true }),
}));
jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
let client: QueryClient;

beforeEach(async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-15T09:00:00Z'));
  mockPush.mockReset();
  mockBack.mockReset();
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
  useAppearanceStore.setState({ preference: 'light' });
});

function wrap(element: React.ReactElement) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>{element}</ToastProvider>
    </QueryClientProvider>,
  );
}

describe('DebtsListScreen', () => {
  it('shows receivables by default with the per-currency remaining balance from the server, then switches to payables', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/finance/debts/summary') {
        return jsonResponse(summary);
      }
      if (url.pathname === '/api/finance/debts') {
        const direction = url.searchParams.get('direction');
        // The page holds one row; the strip must still show the whole balance the server reports.
        return jsonResponse(direction === 'Payable' ? pagedDebts([payable]) : pagedDebts([receivable], 3));
      }
      throw new TypeError(`No mock for ${url.pathname}`);
    });

    const view = await wrap(<DebtsListScreen />);
    expect(await view.findByTestId('debt-row-debt-ali')).toBeTruthy();
    expect(view.getByTestId('debt-outstanding-AZN')).toHaveTextContent('300,00 AZN');
    expect(view.getByTestId('debt-outstanding-USD')).toHaveTextContent('40,00 USD');
    expect(view.getByTestId('debt-overdue-AZN')).toHaveTextContent(/300,00/);
    expect(view.getByText(/Gecikib · 5 gün/)).toBeTruthy();
    expect(view.getByText(/1 \/ 3 göstərilir/)).toBeTruthy();
    expect(view.queryByTestId('debt-row-debt-bank')).toBeNull();

    await fireEvent.press(view.getByRole('radio', { name: 'Mən borcluyam' }));
    expect(await view.findByTestId('debt-row-debt-bank')).toBeTruthy();
    expect(view.getByTestId('debt-outstanding-AZN')).toHaveTextContent('500,00 AZN');
    expect(view.queryByTestId('debt-outstanding-USD')).toBeNull();
    expect(view.queryByTestId('debt-overdue-AZN')).toBeNull();

    await fireEvent.press(view.getByTestId('debt-row-debt-bank'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/finance/debts/[id]', params: { id: 'debt-bank' } });
  });

  it('shows the empty state and the error state with retry', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/finance/debts/summary') {
        return jsonResponse({ ...summary, currencies: [] });
      }
      attempts += 1;
      return attempts === 1 ? jsonResponse({ title: 'Server error', status: 500 }, 500) : jsonResponse(pagedDebts([]));
    });

    const view = await wrap(<DebtsListScreen />);
    expect(await view.findByText('Serverdə xəta baş verdi')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));
    expect(await view.findByText('Sizə borclu olan yoxdur')).toBeTruthy();
    expect(view.getByText('Qalıq yoxdur')).toBeTruthy();
  });

  it('renders in dark mode with the same controls', async () => {
    useAppearanceStore.setState({ preference: 'dark' });
    fetchMock.mockImplementation(async (input) => {
      const url = new URL(String(input));
      return url.pathname === '/api/finance/debts/summary' ? jsonResponse(summary) : jsonResponse(pagedDebts([receivable]));
    });

    const view = await wrap(<DebtsListScreen />);
    expect(await view.findByTestId('debt-row-debt-ali')).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Mənə borcludurlar' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('checkbox', { name: 'Bağlananlar da' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Borc əlavə et' })).toBeTruthy();
  });
});

describe('DebtFormScreen', () => {
  const reads = (path: string) => {
    if (path === '/api/finance/accounts') {
      return jsonResponse([cashAccount, usdAccount]);
    }
    if (path === '/api/finance/debts/debt-ali') {
      return jsonResponse(detailOf({ ...receivable, hasMovements: true, movedCashAtOpening: true }, [payment100]));
    }
    throw new TypeError(`No mock for ${path}`);
  };

  it('records an existing obligation without an account, and money moving now with the account effect', async () => {
    const posts: { direction: string; principal: number; currencyCode: string; accountId: string | null; clientRequestId: string; dueOn: string | null }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push(JSON.parse(init.body as string));
        return jsonResponse(detailOf(receivable), 201);
      }
      return reads(path);
    });

    const view = await wrap(<DebtFormScreen />);
    await view.findByTestId('debt-form-name');

    await fireEvent.press(view.getByTestId('debt-form-submit'));
    expect(await view.findByText('Qarşı tərəfin adını daxil edin.')).toBeTruthy();
    expect(posts).toHaveLength(0);

    await fireEvent.changeText(view.getByTestId('debt-form-name'), 'Əli');
    await fireEvent.changeText(view.getByTestId('debt-form-principal'), '300');
    expect(view.getByText('Heç bir hesabın balansı dəyişmir; yalnız öhdəlik qeyd olunur.')).toBeTruthy();
    expect(view.queryByTestId('debt-form-effect')).toBeNull();

    await fireEvent.press(view.getByTestId('debt-form-submit'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ direction: 'Receivable', principal: 300, currencyCode: 'AZN', accountId: null, dueOn: null });
    expect(posts[0]!.clientRequestId).toMatch(/[0-9a-f-]{36}/);
  });

  it('requires an account when money moves now and shows the effect before submitting', async () => {
    const posts: { accountId: string | null; currencyCode: string; direction: string }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push(JSON.parse(init.body as string));
        return jsonResponse(detailOf({ ...receivable, movedCashAtOpening: true, hasMovements: true }), 201);
      }
      return reads(path);
    });

    const view = await wrap(<DebtFormScreen />);
    await view.findByTestId('debt-form-name');
    await fireEvent.changeText(view.getByTestId('debt-form-name'), 'Əli');
    await fireEvent.changeText(view.getByTestId('debt-form-principal'), '300');
    await fireEvent.press(view.getByRole('radio', { name: 'İndi verirəm' }));

    await fireEvent.press(view.getByTestId('debt-form-submit'));
    expect(await view.findByText('Pulun hansı hesabdan hərəkət etdiyini seçin.')).toBeTruthy();
    expect(posts).toHaveLength(0);

    await fireEvent.press(view.getByRole('button', { name: 'Hesab: Hesab seçin' }));
    await fireEvent.press(await view.findByRole('radio', { name: /USD kart/ }));
    // Lending 300 out of the USD card: 40 → −260, in the account's own currency.
    expect((await view.findByTestId('debt-form-effect')).props.accessibilityLabel).toMatch(/40,00 USD → −260,00 USD/);

    await fireEvent.press(view.getByTestId('debt-form-submit'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ direction: 'Receivable', accountId: 'acc-usd', currencyCode: 'USD' });
  });

  it('locks principal and opening date once a movement exists but still saves a rename with the stale echo', async () => {
    const puts: { counterpartyName: string; principal: number; openedOn: string; expectedUpdatedAtUtc: string }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(init.body as string));
        return jsonResponse(detailOf({ ...receivable, counterpartyName: 'Əli Məmmədov', hasMovements: true }));
      }
      return reads(path);
    });

    const view = await wrap(<DebtFormScreen id="debt-ali" />);
    const principal = await view.findByTestId('debt-form-principal');
    expect(principal.props.editable).toBe(false);
    expect(view.queryByTestId('debt-form-delete')).toBeNull();
    expect(view.getAllByText(/Ödəniş qeyd olunduqdan sonra məbləğ və açılış tarixi dəyişmir/).length).toBeGreaterThan(0);

    await fireEvent.changeText(view.getByTestId('debt-form-name'), 'Əli Məmmədov');
    await fireEvent.press(view.getByTestId('debt-form-submit'));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ counterpartyName: 'Əli Məmmədov', principal: 300, openedOn: '2026-09-01', expectedUpdatedAtUtc: receivable.updatedAtUtc });
  });
});

describe('DebtDetailScreen', () => {
  it('shows an existing debt, records a partial payment once, then undoes it — remaining and history stay in step', async () => {
    let paid = false;
    let undone = false;
    const posts: { path: string; body: { amount?: number; accountId?: string; paidOn?: string; clientRequestId?: string } }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(init.body as string) });
        if (path.endsWith('/undo')) {
          undone = true;
          return jsonResponse(detailOf({ ...receivable, paidAmount: 0, remainingAmount: 300, hasMovements: true }, [{ ...payment100, isReversed: true, cashEffect: 0, reversedAtUtc: '2026-09-15T13:00:00Z' }]));
        }
        paid = true;
        return jsonResponse(detailOf({ ...receivable, paidAmount: 100, remainingAmount: 200, status: 'PartiallyPaid', hasMovements: true }, [payment100]), 201);
      }
      if (path === '/api/finance/debts/debt-ali') {
        if (undone) {
          return jsonResponse(detailOf({ ...receivable, hasMovements: true }, [{ ...payment100, isReversed: true, cashEffect: 0, reversedAtUtc: '2026-09-15T13:00:00Z' }]));
        }
        return jsonResponse(paid ? detailOf({ ...receivable, paidAmount: 100, remainingAmount: 200, status: 'PartiallyPaid', hasMovements: true }, [payment100]) : detailOf(receivable));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount, usdAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await wrap(<DebtDetailScreen id="debt-ali" />);
    expect(await view.findByTestId('debt-remaining')).toHaveTextContent('300,00 AZN');
    expect(view.getByTestId('debt-status')).toHaveTextContent('Açıq');
    expect(view.getByTestId('debt-due')).toHaveTextContent('Gecikib · 5 gün');
    expect(view.getByText(/Hələ hərəkət yoxdur/)).toBeTruthy();

    await fireEvent.press(view.getByTestId('debt-pay'));
    await view.findByTestId('payment-sheet');
    // Defaults to the full remaining balance; the user makes it partial.
    expect(view.getByTestId('payment-amount').props.value).toBe('300');
    await fireEvent.changeText(view.getByTestId('payment-amount'), '100');
    await fireEvent.press(view.getByRole('button', { name: 'Hesab: Hesab seçin' }));
    // Only AZN accounts are offered for an AZN debt.
    expect(view.queryByRole('radio', { name: /USD kart/ })).toBeNull();
    await fireEvent.press(await view.findByRole('radio', { name: /Nağd/ }));
    expect((await view.findByTestId('payment-effect')).props.accessibilityLabel).toMatch(/250,50 AZN → 350,50 AZN/);
    expect(view.getByTestId('payment-remaining-after').props.accessibilityLabel).toBe('Qalıq: 300,00 AZN → 200,00 AZN');
    expect(posts).toHaveLength(0);

    await fireEvent.press(view.getByTestId('payment-confirm'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.path).toBe('/api/finance/debts/debt-ali/payments');
    expect(posts[0]!.body).toMatchObject({ amount: 100, accountId: 'acc-cash', paidOn: '2026-09-15' });
    expect(posts[0]!.body.clientRequestId).toMatch(/[0-9a-f-]{36}/);

    await waitFor(() => expect(view.getByTestId('debt-remaining')).toHaveTextContent('200,00 AZN'));
    expect(view.getByTestId('debt-status')).toHaveTextContent('Qismən ödənilib');
    expect(view.getByTestId('debt-paid')).toHaveTextContent('100,00 AZN');
    expect(view.getByTestId('debt-movement-mv-pay-1')).toHaveTextContent(/Ödəniş alındı/);

    await fireEvent.press(view.getByTestId('debt-undo-mv-pay-1'));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]!.path).toBe('/api/finance/debts/debt-ali/payments/mv-pay-1/undo');
    await waitFor(() => expect(view.getByTestId('debt-remaining')).toHaveTextContent('300,00 AZN'));
    expect(view.getByTestId('debt-movement-mv-pay-1')).toHaveTextContent(/geri alınıb/);
    expect(view.queryByTestId('debt-undo-mv-pay-1')).toBeNull();
  });

  it('rejects more than the remaining balance locally and keeps the sheet with values after a server conflict', async () => {
    const posts: { clientRequestId: string }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push(JSON.parse(init.body as string));
        return jsonResponse({ title: 'Concurrent payment', status: 409, detail: 'Borc eyni anda başqa yerdən dəyişdirilib.' }, 409);
      }
      if (path === '/api/finance/debts/debt-bank') {
        return jsonResponse(detailOf(payable));
      }
      if (path === '/api/finance/accounts') {
        return jsonResponse([cashAccount]);
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await wrap(<DebtDetailScreen id="debt-bank" />);
    await fireEvent.press(await view.findByTestId('debt-pay'));
    await view.findByTestId('payment-sheet');
    await fireEvent.press(view.getByRole('button', { name: 'Hesab: Hesab seçin' }));
    await fireEvent.press(await view.findByRole('radio', { name: /Nağd/ }));
    // Repaying from cash: 250,50 → −249,50 for the full 500.
    expect((await view.findByTestId('payment-effect')).props.accessibilityLabel).toMatch(/250,50 AZN → −249,50 AZN/);

    await fireEvent.changeText(view.getByTestId('payment-amount'), '600');
    await fireEvent.press(view.getByTestId('payment-confirm'));
    expect(await view.findByText('Qalıqdan çox ola bilməz (500,00 AZN).')).toBeTruthy();
    expect(posts).toHaveLength(0);

    await fireEvent.changeText(view.getByTestId('payment-amount'), '120');
    await fireEvent.press(view.getByTestId('payment-confirm'));
    expect(await view.findByText('Borc eyni anda başqa yerdən dəyişdirilib.')).toBeTruthy();
    expect(view.getByTestId('payment-sheet')).toBeTruthy();
    expect(view.getByTestId('payment-amount').props.value).toBe('120');

    await fireEvent.press(view.getByTestId('payment-confirm'));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[0]!.clientRequestId).toBe(posts[1]!.clientRequestId);
  });

  it('hides the payment action once settled and shows the error state with retry', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/finance/debts/debt-ali') {
        attempts += 1;
        return attempts === 1
          ? jsonResponse({ title: 'Server error', status: 500 }, 500)
          : jsonResponse(detailOf({ ...receivable, paidAmount: 300, remainingAmount: 0, status: 'Settled', isOverdue: false, hasMovements: true }, [{ ...payment100, amount: 300, cashEffect: 300 }]));
      }
      return jsonResponse([cashAccount]);
    });

    const view = await wrap(<DebtDetailScreen id="debt-ali" />);
    expect(await view.findByText('Serverdə xəta baş verdi')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));

    expect(await view.findByTestId('debt-status')).toHaveTextContent('Bağlanıb');
    expect(view.queryByTestId('debt-pay')).toBeNull();
    expect(view.queryByTestId('debt-due')).toBeNull();
  });
});
