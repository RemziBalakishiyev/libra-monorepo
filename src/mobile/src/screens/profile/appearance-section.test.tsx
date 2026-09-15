import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { defaultAppearance, useAppearanceStore } from '@/lib/appearance-store';
import { useSessionStore } from '@/lib/session-store';
import { ProfileScreen } from '@/screens/profile';
import { AppearanceSection } from '@/screens/profile/appearance-section';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { fetchByPath, jsonResponse } from '@/test/finance-fixtures';

let mockOsScheme: 'light' | 'dark' | null = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockOsScheme,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

const mockDeviceStore = new Map<string, string>();
jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    getItem: (key: string) => Promise.resolve(mockDeviceStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockDeviceStore.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key: string) => {
      mockDeviceStore.delete(key);
      return Promise.resolve();
    },
  },
}));

const profile = {
  id: 'user-1',
  email: 'ayan@example.com',
  displayName: 'Ayan',
  createdAtUtc: '2026-09-01T00:00:00Z',
  preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' },
};

describe('AppearanceSection', () => {
  beforeEach(() => {
    mockOsScheme = 'light';
    mockDeviceStore.clear();
    useAppearanceStore.setState({ status: 'ready', preference: defaultAppearance });
  });

  it('offers the three choices as one labelled group, with Light chosen on a fresh install', async () => {
    const view = await render(<AppearanceSection />);

    expect(view.getByLabelText('Görünüş')).toBeTruthy();
    expect(view.getByRole('radio', { name: 'Açıq' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByRole('radio', { name: 'Tünd' }).props.accessibilityState.checked).toBe(false);
    expect(view.getByRole('radio', { name: 'Sistem' }).props.accessibilityState.checked).toBe(false);
  });

  it('applies and stores Dark the moment it is tapped, with no save step', async () => {
    const view = await render(<AppearanceSection />);

    await fireEvent.press(view.getByRole('radio', { name: 'Tünd' }));

    await waitFor(() => expect(useAppearanceStore.getState().preference).toBe('dark'));
    expect(view.getByRole('radio', { name: 'Tünd' }).props.accessibilityState.checked).toBe(true);
    expect(mockDeviceStore.get('libra.appearance')).toBe('dark');
    expect(view.getByTestId('appearance-hint')).toHaveTextContent(/həmişə tünd/);
  });

  it('says which palette System currently resolves to', async () => {
    mockOsScheme = 'dark';
    const view = await render(<AppearanceSection />);

    await fireEvent.press(view.getByRole('radio', { name: 'Sistem' }));

    await waitFor(() => expect(useAppearanceStore.getState().preference).toBe('system'));
    expect(view.getByTestId('appearance-hint')).toHaveTextContent(/Hazırda: tünd/);
  });
});

describe('ProfileScreen appearance', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    mockOsScheme = 'light';
    mockDeviceStore.clear();
    useAppearanceStore.setState({ status: 'ready', preference: defaultAppearance });
    fetchMock.mockReset();
    fetchMock.mockImplementation(fetchByPath({ '/api/profile': () => jsonResponse(profile) }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-30T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  it('keeps unsaved profile input and the pending save when the palette changes', async () => {
    const view = await render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ProfileScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(view.getByTestId('profile-appearance')).toBeTruthy());

    // Half-typed name, not yet saved.
    await fireEvent.changeText(view.getByLabelText('Ad'), 'Ayan Məmmədova');
    await waitFor(() => expect(view.getByTestId('profile-save').props.accessibilityState?.disabled ?? false).toBe(false));

    await fireEvent.press(view.getByRole('radio', { name: 'Tünd' }));
    await waitFor(() => expect(useAppearanceStore.getState().preference).toBe('dark'));

    // The palette changed in place: the form was not remounted, the text is still there and Save still applies.
    expect(view.getByLabelText('Ad').props.value).toBe('Ayan Məmmədova');
    expect(view.getByTestId('profile-save').props.accessibilityState?.disabled ?? false).toBe(false);
    // Appearance is a device setting: it was never part of what "Yadda saxla" sends.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });
});
