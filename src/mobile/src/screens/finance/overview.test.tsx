import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { useSessionStore } from '@/lib/session-store';
import { FinanceOverview } from '@/screens/finance/overview';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, dashboard, fetchByPath, jsonResponse } from '@/test/finance-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    Link: ({ children }: { children: ReactElement }) => <Text>{children}</Text>,
  };
});

const monthExpenses = { items: dashboard.recentTransactions, pageNumber: 1, pageSize: 100, totalCount: 1, hasNextPage: false };
const monthExpensesPartial = { items: dashboard.recentTransactions, pageNumber: 1, pageSize: 100, totalCount: 150, hasNextPage: true };

describe('FinanceOverview', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockPush.mockReset();
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
        <FinanceOverview />
      </QueryClientProvider>,
    );
  }

  it('shows a loading state first', async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));

    const view = await renderScreen();

    expect(view.getByText('Hesablar yüklənir…')).toBeTruthy();
  });

  it('offers onboarding when the user has no account', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/finance/accounts': () => jsonResponse([]) }));

    const view = await renderScreen();

    expect(await view.findByText('Başlayaq')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Maliyyəni quraşdır' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/setup');
    // Quick Add is hidden until Finance is set up.
    expect(view.queryByRole('button', { name: 'Tez əlavə et' })).toBeNull();
  });

  it('shows the error state with retry when accounts fail to load', async () => {
    fetchMock.mockImplementation(fetchByPath({ '/api/finance/accounts': () => jsonResponse({ title: 'Server error', status: 500 }, 500) }));

    const view = await renderScreen();

    expect(await view.findByText('Serverdə xəta baş verdi')).toBeTruthy();
    expect(view.getByText('Serverdə xəta baş verdi. Bir az sonra yenidən cəhd edin.')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Yenidən cəhd et' })).toBeTruthy();
  });

  it('renders the dashboard for the selected currency and keeps other currencies separate', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/finance/accounts': () => jsonResponse([cashAccount]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/finance/transactions': () => jsonResponse(monthExpenses),
      }),
    );

    const view = await renderScreen();

    expect(await view.findByText('Sentyabr 2026')).toBeTruthy();
    expect(view.getAllByText(/250,50|250\.50/).length).toBeGreaterThan(0);
    expect(view.getByText(/Ayrıca .*USD/)).toBeTruthy();
    expect(view.getByRole('progressbar', { name: /Ümumi büdcə/ })).toBeTruthy();
    // "Market" appears in the category breakdown and again as the recent transaction title.
    expect(view.getAllByText('Market').length).toBeGreaterThanOrEqual(2);
    expect(view.getByRole('radio', { name: 'USD' })).toBeTruthy();
    expect(view.getByText('Büdcə daxilində')).toBeTruthy();
    expect(await view.findByText('Bu gün')).toBeTruthy();
  });

  it('keeps the monthly totals and marks the daily breakdown unavailable when a later page fails', async () => {
    let transactionCalls = 0;
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/finance/accounts': () => jsonResponse([cashAccount]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/finance/transactions': () => {
          transactionCalls += 1;
          return transactionCalls === 1 ? jsonResponse(monthExpensesPartial) : jsonResponse({ title: 'Server error', status: 500 }, 500);
        },
      }),
    );

    const view = await renderScreen();

    expect(await view.findByText('Sentyabr 2026')).toBeTruthy();
    expect(await view.findByText(/Gündəlik bölgü əlçatan deyil/, {}, { timeout: 4000 })).toBeTruthy();
    // Totals come from the dashboard aggregate and stay on screen.
    expect(view.getByLabelText('Xərc: 49,50 AZN')).toBeTruthy();
    expect(view.queryByText('Bu gün')).toBeNull();
  });

  it('opens the quick-add menu from the header and routes to the expense form', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/finance/accounts': () => jsonResponse([cashAccount]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/finance/transactions': () => jsonResponse(monthExpenses),
      }),
    );

    const view = await renderScreen();
    await view.findByText('Sentyabr 2026');

    await fireEvent.press(view.getByRole('button', { name: 'Tez əlavə et' }));
    expect(await view.findByRole('header', { name: 'Tez əlavə et' })).toBeTruthy();
    // The dashboard pill and the menu row both offer "Xərc"; the menu row is rendered last.
    const expenseButtons = view.getAllByRole('button', { name: 'Xərc' });
    expect(expenseButtons).toHaveLength(2);
    await fireEvent.press(expenseButtons[1]!);
    expect(mockPush).toHaveBeenCalledWith('/finance/transactions/new?type=Expense');
  });

  it('explains the missing second account instead of opening the transfer form', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/finance/accounts': () => jsonResponse([cashAccount]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/finance/transactions': () => jsonResponse(monthExpenses),
      }),
    );

    const view = await renderScreen();
    await view.findByText('Sentyabr 2026');

    await fireEvent.press(view.getByRole('button', { name: 'Köçürmə' }));
    expect(await view.findByText('Köçürmə üçün iki hesab lazımdır')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Hesab yarat' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/accounts/new');
    expect(mockPush).not.toHaveBeenCalledWith('/finance/transfers/new');
  });
});
