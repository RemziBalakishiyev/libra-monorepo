import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { currentYearMonth } from '@/lib/dates';
import { useSessionStore } from '@/lib/session-store';
import { TransactionFormScreen } from '@/screens/finance/transaction-form';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, categories, dashboard, fetchByPath, jsonResponse } from '@/test/finance-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

/**
 * The budget preview is only drawn for the dashboard's own month, and the form opens on today. Both fixtures
 * therefore follow the clock: pinning them to one month made the suite pass only until that month was over.
 */
const thisMonth = currentYearMonth();
const currentDashboard = { ...dashboard, year: thisMonth.year, month: thisMonth.month };

const marketBudget = {
  id: 'bud-market',
  year: thisMonth.year,
  month: thisMonth.month,
  currencyCode: 'AZN',
  categoryId: 'cat-market',
  categoryName: 'Market',
  amount: 60,
  usedAmount: 49.5,
  remainingAmount: 10.5,
  usagePercent: 82.5,
  isOverBudget: false,
  createdAtUtc: '2026-09-01T00:00:00Z',
  updatedAtUtc: '2026-09-01T00:00:00Z',
};

const createdTransaction = (body: { clientRequestId: string; amount: number }) => ({
  id: 'tx-new',
  accountId: 'acc-cash',
  accountName: 'Nağd',
  currencyCode: 'AZN',
  categoryId: 'cat-market',
  categoryName: 'Market',
  type: 'Expense',
  amount: body.amount,
  occurredAtUtc: '2026-09-05T08:00:00Z',
  note: null,
  clientRequestId: body.clientRequestId,
  createdAtUtc: '2026-09-05T08:00:00Z',
  updatedAtUtc: '2026-09-05T08:00:00Z',
});

describe('TransactionFormScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockBack.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({
      accessToken: 'access',
      accessTokenExpiresAtUtc: '2026-09-06T00:00:00Z',
      refreshToken: 'refresh',
      refreshTokenExpiresAtUtc: '2026-10-06T00:00:00Z',
    });
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <TransactionFormScreen initialType="Expense" />
      </QueryClientProvider>,
    );
  }

  const baseRoutes = {
    '/api/finance/accounts': () => jsonResponse([cashAccount]),
    '/api/finance/categories': () => jsonResponse(categories),
    '/api/finance/dashboard': () => jsonResponse(currentDashboard),
    '/api/finance/budgets': () => jsonResponse([marketBudget]),
  };

  it('shows the missing-category message as an alert next to the field and never posts an invalid form', async () => {
    fetchMock.mockImplementation(fetchByPath(baseRoutes));
    const view = await renderScreen();
    await view.findByRole('radio', { name: 'Market' });

    await fireEvent.changeText(view.getByLabelText(/Məbləğ/), '1.005');
    await fireEvent.press(view.getByRole('button', { name: 'Xərc əlavə et' }));

    const alerts = await view.findAllByRole('alert');
    expect(alerts.some((alert) => alert.props.children === 'Kateqoriya seçin.')).toBe(true);
    expect(view.getByText('Məbləğ sıfırdan böyük olmalı və ən çox 2 onluq rəqəm olmalıdır.')).toBeTruthy();
    // The field itself carries the message as its hint; the shortcut chips are not marked as errors.
    expect(view.getByLabelText('Kateqoriya: seçilməyib').props.accessibilityHint).toBe('Kateqoriya seçin.');
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(posts).toHaveLength(0);
  });

  it('offers recent categories as shortcuts, a searchable "Hamısı" sheet, and the selected category in the field', async () => {
    fetchMock.mockImplementation(fetchByPath(baseRoutes));
    const view = await renderScreen();
    await view.findByRole('radio', { name: 'Market' });

    await fireEvent.press(view.getByRole('button', { name: 'Hamısı' }));
    await fireEvent.changeText(await view.findByLabelText('Kateqoriya axtar'), 'mar');
    const options = view.getAllByRole('radio', { name: /Market/ });
    await fireEvent.press(options[options.length - 1]!);

    expect(view.getByLabelText('Kateqoriya: Market')).toBeTruthy();
  });

  it('shows the localised date and the budget impact for the chosen category', async () => {
    fetchMock.mockImplementation(fetchByPath(baseRoutes));
    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('radio', { name: 'Market' }));
    await fireEvent.changeText(view.getByLabelText(/Məbləğ/), '25');

    expect(view.queryByText(/\d{4}-\d{2}-\d{2}/)).toBeNull();
    expect(view.getByLabelText(/^Tarix: \d{1,2} [a-zçəğıöşü]+ \d{4}$/)).toBeTruthy();
    expect(await view.findByText(/Market büdcəsi: qalıq 10,50/)).toBeTruthy();
    expect(view.getByText(/büdcəni 14,50 AZN aşacaq/)).toBeTruthy();
  });

  it('reuses one clientRequestId when the submit is retried after a failure and notifies once after returning', async () => {
    let attempts = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const route = baseRoutes[path as keyof typeof baseRoutes];
      if (path === '/api/finance/transactions' && init?.method === 'POST') {
        attempts += 1;
        if (attempts === 1) {
          throw new TypeError('Network request failed');
        }
        return jsonResponse(createdTransaction(JSON.parse(init.body as string) as { clientRequestId: string; amount: number }), 201);
      }
      if (route) {
        return route();
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('radio', { name: 'Market' }));
    await fireEvent.changeText(view.getByLabelText(/Məbləğ/), '12,50');

    await fireEvent.press(view.getByRole('button', { name: 'Xərc əlavə et' }));
    expect(await view.findByText('Serverə qoşulmaq mümkün olmadı. Bağlantını yoxlayıb yenidən cəhd edin.')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Xərc əlavə et' }));
    expect(await view.findByRole('button', { name: 'Əlavə olundu' })).toBeTruthy();
    // No toast over the form while the success state is visible.
    expect(view.queryByText('Xərc əlavə olundu')).toBeNull();
    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 2000 });

    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    expect(posts).toHaveLength(2);
    const [firstBody, secondBody] = posts.map((call) => JSON.parse(call[1]!.body as string) as { clientRequestId: string; amount: number; type: string });
    expect(firstBody!.clientRequestId).toBe(secondBody!.clientRequestId);
    expect(secondBody!.amount).toBe(12.5);
    expect(secondBody!.type).toBe('Expense');
  });

  it('keeps the budget preview on the pre-submit baseline while the invalidated budget query updates', async () => {
    let saved = false;
    let budgetsAfterSave = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/finance/transactions' && init?.method === 'POST') {
        saved = true;
        return jsonResponse(createdTransaction(JSON.parse(init.body as string) as { clientRequestId: string; amount: number }), 201);
      }
      if (path === '/api/finance/budgets') {
        if (saved) {
          budgetsAfterSave += 1;
        }
        // After the save the server already counts the new 8,00: used 57,50 of 60,00.
        return jsonResponse([saved ? { ...marketBudget, usedAmount: 57.5, remainingAmount: 2.5, usagePercent: 95.8 } : marketBudget]);
      }
      const route = baseRoutes[path as keyof typeof baseRoutes];
      if (route) {
        return route();
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('radio', { name: 'Market' }));
    await fireEvent.changeText(view.getByLabelText(/Məbləğ/), '8');
    expect(await view.findByText(/Market büdcəsi: qalıq 10,50 → 2,50 AZN/)).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Xərc əlavə et' }));
    await view.findByRole('button', { name: 'Əlavə olundu' });
    // The mutation invalidates every finance query; wait until the budgets have actually been re-read.
    await waitFor(() => expect(budgetsAfterSave).toBeGreaterThanOrEqual(1));

    expect(view.getByText(/Market büdcəsi: qalıq 10,50 → 2,50 AZN/)).toBeTruthy();
    expect(view.queryByText(/aşacaq/)).toBeNull();
    expect(view.queryByText(/→ −/)).toBeNull();
    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 2000 });
    expect(view.queryByText(/aşacaq/)).toBeNull();
  });

  it('posts once when the submit control is pressed twice', async () => {
    const pending: { resolve: (() => void) | null } = { resolve: null };
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === '/api/finance/transactions' && init?.method === 'POST') {
        return new Promise<Response>((resolve) => {
          pending.resolve = () => resolve(jsonResponse(createdTransaction(JSON.parse(init.body as string) as { clientRequestId: string; amount: number }), 201));
        });
      }
      const route = baseRoutes[path as keyof typeof baseRoutes];
      if (route) {
        return route();
      }
      throw new TypeError(`No mock for ${path}`);
    });

    const view = await renderScreen();
    await fireEvent.press(await view.findByRole('radio', { name: 'Market' }));
    await fireEvent.changeText(view.getByLabelText(/Məbləğ/), '9');

    const submit = view.getByRole('button', { name: 'Xərc əlavə et' });
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    await fireEvent.press(submit);
    await waitFor(() => expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1));

    pending.resolve?.();
    await view.findByRole('button', { name: 'Əlavə olundu' });
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  });
});
