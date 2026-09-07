import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';

import { useSessionStore } from '@/lib/session-store';
import { Home } from '@/screens/home';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, dashboard, fetchByPath, jsonResponse } from '@/test/finance-fixtures';

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
      }),
    );
    const view = await renderHome();

    expect(await view.findByText('Salam, Ayan Məmmədova-Hüseynzadə')).toBeTruthy();
    expect(await view.findByText('Hesab balansı')).toBeTruthy();
    expect(view.getByText(/Bu ayın pul axını/)).toBeTruthy();
    expect(view.getByLabelText('Xalis axın: 250,50 AZN')).toBeTruthy();
    expect(view.getAllByText('Tezliklə')).toHaveLength(3);

    await fireEvent.press(view.getByRole('button', { name: 'Tez əlavə et' }));
    await fireEvent.press(await view.findByRole('button', { name: 'Gəlir' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/transactions/new?type=Income');
  });

  it('shows the setup card and no Quick Add before Finance exists', async () => {
    fetchMock.mockImplementation(
      fetchByPath({
        '/api/profile': () => jsonResponse(profile),
        '/api/finance/accounts': () => jsonResponse([]),
        '/api/finance/dashboard': () => jsonResponse(dashboard),
      }),
    );
    const view = await renderHome();

    expect(await view.findByText('Maliyyə hələ quraşdırılmayıb')).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Tez əlavə et' })).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: 'Maliyyəni quraşdır' }));
    expect(mockPush).toHaveBeenCalledWith('/finance/setup');
  });
});
