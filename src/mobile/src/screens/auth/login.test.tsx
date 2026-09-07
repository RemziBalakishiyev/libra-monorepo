import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { useSessionStore } from '@/lib/session-store';
import { LoginScreen } from '@/screens/auth/login';
import { createTestQueryClient } from '@/test/create-test-query-client';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Link: ({ children }: { children: ReactElement }) => <Text>{children}</Text>,
  };
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

describe('LoginScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().clear();
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it('shows validation messages and does not call the API for an empty form', async () => {
    const view = await render(
      <QueryClientProvider client={client}>
        <LoginScreen />
      </QueryClientProvider>,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Daxil ol' }));

    expect(await view.findByText('E-poçt daxil edin.')).toBeTruthy();
    expect(view.getByText('Şifrə daxil edin.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in and stores the session on success', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        accessToken: 'access',
        accessTokenExpiresAtUtc: '2026-09-05T10:15:00Z',
        refreshToken: 'refresh',
        refreshTokenExpiresAtUtc: '2026-10-05T10:00:00Z',
      }),
    );
    const view = await render(
      <QueryClientProvider client={client}>
        <LoginScreen />
      </QueryClientProvider>,
    );

    await fireEvent.changeText(view.getByLabelText('E-poçt'), 'user@example.com');
    await fireEvent.changeText(view.getByLabelText('Şifrə'), 'correct horse battery');
    await fireEvent.press(view.getByRole('button', { name: 'Daxil ol' }));

    await waitFor(() => expect(useSessionStore.getState().status).toBe('signedIn'));
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://localhost:5134/api/auth/login');
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      email: 'user@example.com',
      password: 'correct horse battery',
    });
    expect(useSessionStore.getState().tokens?.refreshToken).toBe('refresh');
  });

  it('shows a friendly message when credentials are rejected', async () => {
    fetchMock.mockResolvedValueOnce(json({ title: 'Invalid credentials', status: 401 }, 401));
    const view = await render(
      <QueryClientProvider client={client}>
        <LoginScreen />
      </QueryClientProvider>,
    );

    await fireEvent.changeText(view.getByLabelText('E-poçt'), 'user@example.com');
    await fireEvent.changeText(view.getByLabelText('Şifrə'), 'wrong-password');
    await fireEvent.press(view.getByRole('button', { name: 'Daxil ol' }));

    expect(await view.findByText('E-poçt və ya şifrə yanlışdır.')).toBeTruthy();
    expect(useSessionStore.getState().status).toBe('signedOut');
  });
});
