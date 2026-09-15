import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { useSessionStore } from '@/lib/session-store';
import { Home } from '@/screens/home';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, dashboard, fetchByPath, jsonResponse } from '@/test/finance-fixtures';
import { nutritionDay } from '@/test/nutrition-fixtures';
import { makeSession, makeSummary } from '@/test/sleep-fixtures';
import { makeDay, makeTask } from '@/test/task-fixtures';

const mockPush = jest.fn();
const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const profile = {
  id: 'user-1',
  email: 'ayan.mammadova-very-long-name@example.com',
  displayName: 'Ayan Məmmədova-Hüseynzadə',
  createdAtUtc: '2026-09-01T00:00:00Z',
  preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' },
};

describe('Home', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockPush.mockReset();
    mockNavigate.mockReset();
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-07T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-07T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  function renderHome() {
    return render(
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>,
    );
  }

  it('keeps the account balance apart from the month cash flow and offers Quick Add in the header', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/profile': () => jsonResponse(profile),
        '/api/finance/accounts': () => jsonResponse([cashAccount]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/nutrition/day': () => jsonResponse(nutritionDay()),
        '/api/tasks/today': () => jsonResponse(makeDay({ tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b', isCompleted: true })] })),
        '/api/sleep/summary': () => jsonResponse(makeSummary({ latest: makeSession({ id: 'last' }) })),
      }),
    );
    const view = await renderHome();

    expect(await view.findByText('Salam, Ayan Məmmədova-Hüseynzadə')).toBeTruthy();
    expect(await view.findByText('Hesab balansı')).toBeTruthy();
    expect(view.getByText(/Bu ayın pul axını/)).toBeTruthy();
    expect(view.getByLabelText('Xalis axın: 250,50 AZN')).toBeTruthy();
    // Nutrition and Plan are live modules now; only AI is still upcoming.
    expect(view.getAllByText('Tezliklə')).toHaveLength(1);
    // Today's nutrition figure comes from the API, not from a placeholder.
    expect(await view.findByText('695 / 2.200 kkal')).toBeTruthy();
    // And so does today's plan.
    expect(await view.findByText('1 / 2 tamamlanıb')).toBeTruthy();
    // The sleep card reports the last night and opens the sleep screen; it never starts or ends one.
    expect(await view.findByTestId('home-sleep-value')).toHaveTextContent(/^8 s 30 d$/);

    await fireEvent.press(view.getByRole('button', { name: 'Tez əlavə et' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gəlir' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/transactions/new?type=Income');
  });

  it('offers the setup card, and Quick Add still records a meal before Finance exists', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/profile': () => jsonResponse(profile),
        '/api/finance/accounts': () => jsonResponse([]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
        '/api/nutrition/day': () => jsonResponse(nutritionDay([], null)),
        '/api/tasks/today': () => jsonResponse(makeDay({ tasks: [], counts: { scheduled: 0, completed: 0, overdue: 0 } })),
      }),
    );
    const view = await renderHome();

    expect(await view.findByText('Maliyyə hələ quraşdırılmayıb')).toBeTruthy();
    expect(await view.findByText('Bu gün qeyd yoxdur')).toBeTruthy();
    // Tasks work before Finance exists too, and say so honestly when there are none.
    expect(await view.findByText('Bu gün tapşırıq yoxdur')).toBeTruthy();

    // Neither a meal nor a task needs an account, so Quick Add offers exactly those two before setup.
    await fireEvent.press(view.getByRole('button', { name: 'Tez əlavə et' }));
    expect(view.queryByRole('button', { name: 'Xərc' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Köçürmə' })).toBeNull();
    expect(await view.findByRole('button', { name: 'Tapşırıq' })).toBeTruthy();
    await fireEvent.press(await view.findByRole('button', { name: 'Yemək' }));
    expect(mockPush).toHaveBeenCalledWith('/nutrition/new');

    await fireEvent.press(view.getByRole('button', { name: 'Maliyyəni quraşdır' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/setup');
  });
});
