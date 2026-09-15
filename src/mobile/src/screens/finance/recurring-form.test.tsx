import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { RecurringFormScreen } from '@/screens/finance/recurring-form';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { cashAccount, categories, jsonResponse } from '@/test/finance-fixtures';
import { rentTemplate } from '@/test/recurring-debt-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));
jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

describe('RecurringFormScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;

  beforeEach(async () => {
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
  });

  function renderScreen(id?: string) {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <RecurringFormScreen id={id} />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  const reads = (path: string) => {
    if (path === '/api/finance/accounts') {
      return jsonResponse([cashAccount]);
    }
    if (path === '/api/finance/categories') {
      return jsonResponse(categories.filter((category) => category.kind === 'Expense'));
    }
    if (path === '/api/finance/recurring/templates/tpl-rent') {
      return jsonResponse(rentTemplate);
    }
    throw new TypeError(`No mock for ${path}`);
  };

  it('validates before posting and creates a template with one clientRequestId', async () => {
    const posts: { clientRequestId: string; title: string; amount: number; dayOfMonth: number; accountId: string; categoryId: string; endDate: string | null }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'POST') {
        posts.push(JSON.parse(init.body as string));
        return jsonResponse({ ...rentTemplate, id: 'tpl-new' }, 201);
      }
      return reads(path);
    });

    const view = await renderScreen();
    await view.findByRole('radio', { name: 'Market' });

    await fireEvent.press(view.getByTestId('template-submit'));
    expect(await view.findByText('Ad daxil edin.')).toBeTruthy();
    expect(posts).toHaveLength(0);

    await fireEvent.changeText(view.getByTestId('template-title'), 'Kirayə');
    await fireEvent.changeText(view.getByTestId('template-amount'), '450');
    await fireEvent.press(view.getByRole('button', { name: 'Hesab: Hesab seçin' }));
    await fireEvent.press(await view.findByRole('radio', { name: /Nağd/ }));
    await fireEvent.press(view.getByRole('radio', { name: 'Market' }));
    await fireEvent.press(view.getByRole('button', { name: 'Ayın günü: 1' }));
    await fireEvent.press(await view.findByRole('radio', { name: /^31/ }));
    expect(view.getByText(/Qısa aylarda ayın son gününə keçir/)).toBeTruthy();

    await fireEvent.press(view.getByTestId('template-submit'));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.title).toBe('Kirayə');
    expect(posts[0]!.amount).toBe(450);
    expect(posts[0]!.dayOfMonth).toBe(31);
    expect(posts[0]!.accountId).toBe('acc-cash');
    expect(posts[0]!.categoryId).toBe('cat-market');
    expect(posts[0]!.endDate).toBeNull();
    expect(posts[0]!.clientRequestId).toMatch(/[0-9a-f-]{36}/);
    expect(await view.findByRole('button', { name: 'Əlavə olundu' })).toBeTruthy();
    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 2000 });
  });

  it('edits an existing template with the stale-edit echo and shows a 409 without losing the form', async () => {
    const puts: { expectedUpdatedAtUtc: string; isActive: boolean; amount: number }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(init.body as string));
        return puts.length === 1 ? jsonResponse({ title: 'Stale', status: 409, detail: 'Şablon başqa yerdə dəyişdirilib.' }, 409) : jsonResponse({ ...rentTemplate, amount: 475 });
      }
      return reads(path);
    });

    const view = await renderScreen('tpl-rent');
    const amount = await view.findByTestId('template-amount');
    expect(amount.props.value).toBe('450');
    await fireEvent.changeText(amount, '475');

    await fireEvent.press(view.getByTestId('template-submit'));
    expect(await view.findByText('Şablon başqa yerdə dəyişdirilib.')).toBeTruthy();
    expect(view.getByTestId('template-amount').props.value).toBe('475');

    await fireEvent.press(view.getByTestId('template-submit'));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]!.expectedUpdatedAtUtc).toBe(rentTemplate.updatedAtUtc);
    expect(puts[1]!.isActive).toBe(true);
    expect(puts[1]!.amount).toBe(475);
  });

  it('deactivates after confirmation without changing the plan fields', async () => {
    const puts: { isActive: boolean; amount: number; dayOfMonth: number }[] = [];
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'PUT') {
        puts.push(JSON.parse(init.body as string));
        return jsonResponse({ ...rentTemplate, isActive: false });
      }
      return reads(path);
    });

    const view = await renderScreen('tpl-rent');
    await fireEvent.press(await view.findByTestId('template-toggle-active'));

    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toMatchObject({ isActive: false, amount: 450, dayOfMonth: 31 });
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('explains why a template with history cannot be deleted', async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (init?.method === 'DELETE') {
        return jsonResponse({ title: 'Has history', status: 409, detail: 'Qeyd olunmuş ayları olan şablon silinmir; dayandırın.' }, 409);
      }
      return reads(path);
    });

    const view = await renderScreen('tpl-rent');
    await fireEvent.press(await view.findByTestId('template-delete'));

    expect(await view.findByText('Qeyd olunmuş ayları olan şablon silinmir; dayandırın.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
