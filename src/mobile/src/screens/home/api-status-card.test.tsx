import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ApiStatusCard } from '@/screens/home/api-status-card';
import { createTestQueryClient } from '@/test/create-test-query-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

describe('ApiStatusCard', () => {
  const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  let client: QueryClient;

  function renderWithQuery(ui: ReactElement) {
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  }

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
  });

  it('shows the readiness report when the API responds', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 'Healthy',
        totalDurationMs: 3.2,
        checks: [{ name: 'postgresql', status: 'Healthy', durationMs: 3.1, description: null }],
      }),
    );

    const view = await renderWithQuery(<ApiStatusCard />);

    expect(await view.findByText('Hazırdır (Healthy)')).toBeTruthy();
    expect(view.getByText('postgresql: Healthy')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5134/health/ready',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('shows an error with a retry action when the API is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: 'Unhealthy', totalDurationMs: 1, checks: [] }, 503),
    );

    const view = await renderWithQuery(<ApiStatusCard />);

    expect(await view.findByText('API-yə qoşulmaq mümkün olmadı.')).toBeTruthy();
    expect(view.getByText('Network request failed')).toBeTruthy();

    await fireEvent.press(view.getByRole('button', { name: 'Yenidən cəhd et' }));

    await waitFor(() => expect(view.getByText('Hazır deyil (Unhealthy)')).toBeTruthy());
  });
});
