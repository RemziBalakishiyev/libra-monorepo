import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { confirmAsync } from '@/lib/confirm';
import { useSessionStore } from '@/lib/session-store';
import { AssistantScreen } from '@/screens/ai';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

const ALL = ['Finance', 'Nutrition', 'Tasks', 'Sleep', 'Focus'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const snapshot = (collectedAtUtc = '2026-10-03T09:00:00Z') => ({
  timeZone: 'Asia/Baku',
  rangeFrom: '2026-10-03',
  rangeTo: '2026-10-03',
  collectedAtUtc,
  modules: ALL,
  facts: [
    { id: 'finance.expense.month', module: 'Finance', label: 'Bu ayın xərci', availability: 'Available', value: 420.5, unit: 'AZN', text: null, period: '2026-10-01 – 2026-10-03', caveat: null, sourceRoute: '/finance' },
    { id: 'nutrition.energy.today', module: 'Nutrition', label: 'Bu günün enerjisi', availability: 'NoRecords', value: null, unit: 'kcal', text: null, period: '2026-10-03', caveat: 'Qeyd olunan qidalanma tam olmaya bilər', sourceRoute: '/nutrition' },
  ],
});

const answer = (overrides: Record<string, unknown> = {}) => ({
  outcome: 'Answer',
  summary: 'Bu gün xərcləriniz 420,50 AZN-dir.',
  observations: [{ text: 'Xərc bu ayın əvvəlindən bəri toplanıb.', factIds: ['finance.expense.month'] }],
  suggestions: [],
  followUps: ['Hansı kateqoriya ən çox xərc aparır?'],
  clarification: null,
  model: 'gpt-test',
  isFixture: false,
  snapshot: snapshot(),
  ...overrides,
});

const conversation = (messages: unknown[], overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1',
  title: 'Pul hara gedir?',
  modules: ALL,
  period: 'Today',
  createdAtUtc: '2026-10-03T09:00:00Z',
  updatedAtUtc: '2026-10-03T09:00:01Z',
  messages,
  ...overrides,
});

const turn = (overrides: Record<string, unknown> = {}) => [
  { id: 'm1', role: 'user', text: 'Pul hara gedir?', createdAtUtc: '2026-10-03T09:00:00Z', answer: null },
  { id: 'm2', role: 'assistant', text: '', createdAtUtc: '2026-10-03T09:00:01Z', answer: answer(overrides) },
];

describe('AssistantScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: { path: string; method: string; body: Record<string, unknown> | undefined }[];
  let status: { isConfigured: boolean; isFixture: boolean; model: string | null; defaultModules: string[] };
  let askResponse: () => Response;
  let storedConversation: () => Response;

  beforeEach(async () => {
    mockPush.mockReset();
    jest.mocked(confirmAsync).mockClear().mockResolvedValue(true);
    calls = [];
    status = { isConfigured: true, isFixture: false, model: 'gpt-test', defaultModules: ALL };
    storedConversation = () => jsonResponse(conversation(turn()));
    askResponse = () => storedConversation();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
      if (url.pathname === '/api/profile') {
        return jsonResponse({ id: 'user-a', email: 'a@b.c', displayName: 'Ayan', preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' }, createdAtUtc: '2026-01-01T00:00:00Z' });
      }
      if (url.pathname === '/api/assistant/status') {
        return jsonResponse(status);
      }
      if (url.pathname === '/api/assistant/ask') {
        return askResponse();
      }
      if (url.pathname === '/api/assistant/conversations') {
        return jsonResponse({ items: [{ id: 'conv-1', title: 'Pul hara gedir?', modules: ALL, period: 'Today', updatedAtUtc: '2026-10-03T09:00:01Z' }], pageNumber: 1, pageSize: 20, totalCount: 1, hasNextPage: false });
      }
      if (url.pathname.startsWith('/api/assistant/conversations/')) {
        return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : storedConversation();
      }
      throw new TypeError(`No mock for ${url.pathname}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-11-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-11-30T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => client.clear());

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <AssistantScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('opens on the landing composition with the four prompts and a visible context control', async () => {
    const view = await renderScreen();

    await waitFor(() => view.getByTestId('assistant-heading'));
    expect(view.getByTestId('assistant-heading')).toHaveTextContent('Bu gün nəyə diqqət edək?');
    expect(view.getByTestId('assistant-orb', { includeHiddenElements: true })).toBeTruthy();
    for (const title of ['Günümü təhlil et', 'Pul hara gedir?', 'Qidalanmam necədir?', 'Günümü planlaşdır']) {
      expect(view.getByLabelText(title)).toBeTruthy();
    }
    // The period and the modules in scope are stated before anything is asked, never implied.
    expect(view.getByTestId('assistant-context-line')).toHaveTextContent(/Bu gün · Bütün modullar/);
    expect(view.getByTestId('assistant-context-range')).toHaveTextContent(/\d/);
  });

  it('asks a prompt, collapses the intro and renders metric cards from the server snapshot', async () => {
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Pul hara gedir?'));

    await fireEvent.press(view.getByLabelText('Pul hara gedir?'));

    await waitFor(() => view.getByTestId('assistant-thread'));
    // The introduction gives way to the conversation.
    expect(view.queryByTestId('assistant-heading')).toBeNull();
    expect(view.getByTestId('assistant-summary')).toHaveTextContent(/420,50/);
    // The figure comes from the cited fact, not from the prose.
    // Money keeps both decimals, exactly as the server computed them.
    expect(view.getByTestId('assistant-metric-finance.expense.month')).toHaveTextContent(/420,50 AZN/);
    expect(view.getByTestId('assistant-follow-up')).toHaveTextContent(/Hansı kateqoriya/);

    const ask = calls.find((call) => call.path === '/api/assistant/ask');
    expect(ask?.body?.question).toBe('Pul hara gedir?');
    expect(ask?.body?.modules).toEqual(['Finance']);
    // The API binds this as a Guid: anything else is a 500 on a real device.
    expect(ask?.body?.clientRequestId).toMatch(UUID);
  });

  it('shows the source details with the period, the collection time and missing records', async () => {
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Pul hara gedir?'));
    await fireEvent.press(view.getByLabelText('Pul hara gedir?'));
    await waitFor(() => view.getByTestId('assistant-sources-open'));

    await fireEvent.press(view.getByTestId('assistant-sources-open'));

    await waitFor(() => view.getByTestId('assistant-sources-period'));
    expect(view.getByTestId('assistant-sources-period')).toHaveTextContent(/2026-10-03/);
    // A day with no entries reads as "no records", never as a zero the user achieved.
    expect(view.getByTestId('assistant-source-nutrition.energy.today')).toHaveTextContent(/Qeyd yoxdur/);
    expect(view.getByTestId('assistant-source-nutrition.energy.today')).toHaveTextContent(/tam olmaya bilər/);

    await fireEvent.press(view.getByTestId('assistant-source-open-finance.expense.month'));
    expect(mockPush).toHaveBeenCalledWith('/finance');
  });

  it('retries a failed question under the same client request id instead of asking twice', async () => {
    let attempt = 0;
    askResponse = () => {
      attempt += 1;
      return attempt === 1 ? jsonResponse({ title: 'Xəta', status: 503 }, 503) : storedConversation();
    };
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Pul hara gedir?'));

    await fireEvent.press(view.getByLabelText('Pul hara gedir?'));
    await waitFor(() => view.getByTestId('assistant-retry'));
    expect(view.getByTestId('assistant-retry')).toHaveTextContent(/Pul hara gedir\?/);

    await fireEvent.press(view.getByTestId('assistant-retry-send'));

    await waitFor(() => view.getByTestId('assistant-thread'));
    const asks = calls.filter((call) => call.path === '/api/assistant/ask');
    expect(asks).toHaveLength(2);
    // The same turn resumes; the server deduplicates on this id rather than storing a second question.
    expect(asks[0]!.body?.clientRequestId).toBe(asks[1]!.body?.clientRequestId);
    expect(asks[0]!.body?.clientRequestId).toMatch(UUID);
  });

  it('types a question in the composer and shows an honest in-flight state', async () => {
    let release: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
      if (url.pathname === '/api/profile') {
        return jsonResponse({ id: 'user-a', email: 'a@b.c', displayName: 'Ayan', preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' }, createdAtUtc: '2026-01-01T00:00:00Z' });
      }
      if (url.pathname === '/api/assistant/status') {
        return jsonResponse(status);
      }
      if (url.pathname === '/api/assistant/ask') {
        return new Promise<Response>((resolve) => {
          release = resolve;
        });
      }
      throw new TypeError(`No mock for ${url.pathname}`);
    });

    const view = await renderScreen();
    // The composer only accepts a question once the status says the assistant is available.
    await waitFor(() => view.getByTestId('assistant-heading'));

    await fireEvent.changeText(view.getByTestId('assistant-input'), 'Bu həftə yuxum necədir?');
    await fireEvent.press(view.getByTestId('assistant-send'));

    // While one request is in flight the screen says exactly that: no percentage, no simulated streaming.
    await waitFor(() => view.getByTestId('assistant-thinking'));
    expect(view.getByTestId('assistant-thinking')).toHaveTextContent(/Qeydləriniz oxunur/);

    release?.(storedConversation());
    await waitFor(() => expect(view.queryByTestId('assistant-thinking')).toBeNull());
  });

  it('states plainly that the assistant is not active yet and keeps the composer disabled', async () => {
    status = { isConfigured: false, isFixture: false, model: null, defaultModules: ALL };
    const view = await renderScreen();

    await waitFor(() => view.getByText('AI köməkçi hələ aktiv deyil'));
    // No canned advice stands in for an answer, and nothing can be sent.
    expect(view.queryByTestId('assistant-heading')).toBeNull();
    expect(view.getByTestId('assistant-input')).toBeDisabled();
    expect(view.getByTestId('assistant-send')).toBeDisabled();
    expect(calls.some((call) => call.path === '/api/assistant/ask')).toBe(false);
  });

  it('labels a fixture answer as a sample rather than a real one', async () => {
    status = { isConfigured: true, isFixture: true, model: 'development-fixture', defaultModules: ALL };
    storedConversation = () => jsonResponse(conversation(turn({ isFixture: true, model: 'development-fixture' })));
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Günümü təhlil et'));

    await fireEvent.press(view.getByLabelText('Günümü təhlil et'));

    await waitFor(() => view.getByTestId('assistant-fixture-badge'));
    expect(view.getByTestId('assistant-fixture-badge')).toHaveTextContent(/fixture/i);
  });

  it('names an insufficient-data outcome instead of answering anyway', async () => {
    storedConversation = () =>
      jsonResponse(
        conversation(
          turn({
            outcome: 'InsufficientData',
            summary: 'Bu dövrdə kifayət qədər qeyd yoxdur.',
            observations: [],
            followUps: [],
          }),
        ),
      );
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Qidalanmam necədir?'));

    await fireEvent.press(view.getByLabelText('Qidalanmam necədir?'));

    await waitFor(() => view.getByTestId('assistant-outcome'));
    expect(view.getByTestId('assistant-outcome')).toHaveTextContent(/Kifayət qədər məlumat yoxdur/);
    expect(view.queryByTestId('assistant-metric-finance.expense.month')).toBeNull();
  });

  it('changes the context, starts a fresh conversation and sends the narrowed scope', async () => {
    const view = await renderScreen();
    await waitFor(() => view.getByLabelText('Günümü təhlil et'));
    await fireEvent.press(view.getByLabelText('Günümü təhlil et'));
    await waitFor(() => view.getByTestId('assistant-thread'));

    await fireEvent.press(view.getByTestId('assistant-context'));
    await waitFor(() => view.getByTestId('assistant-period-LastSevenDays'));
    await fireEvent.press(view.getByTestId('assistant-period-LastSevenDays'));
    for (const module of ['Finance', 'Nutrition', 'Tasks']) {
      await fireEvent.press(view.getByTestId(`assistant-module-${module}`));
    }
    await fireEvent.press(view.getByTestId('assistant-context-apply'));

    // The earlier turn is left behind, so excluded modules cannot be reintroduced by the history.
    await waitFor(() => view.getByTestId('assistant-heading'));
    expect(view.getByTestId('assistant-context-line')).toHaveTextContent(/Son 7 gün · Yuxu, Fokus/);

    await fireEvent.changeText(view.getByTestId('assistant-input'), 'Yuxum necədir?');
    await fireEvent.press(view.getByTestId('assistant-send'));

    await waitFor(() => expect(calls.filter((call) => call.path === '/api/assistant/ask')).toHaveLength(2));
    const latest = calls.filter((call) => call.path === '/api/assistant/ask').at(-1);
    expect(latest?.body?.period).toBe('LastSevenDays');
    expect(latest?.body?.modules).toEqual(['Sleep', 'Focus']);
    expect(latest?.body?.conversationId).toBeNull();
  });

  it('opens a stored conversation from the history and deletes it after confirmation', async () => {
    const view = await renderScreen();
    await waitFor(() => view.getByTestId('assistant-history-open'));

    await fireEvent.press(view.getByTestId('assistant-history-open'));
    await waitFor(() => view.getByTestId('assistant-history-open-conv-1'));

    await fireEvent.press(view.getByTestId('assistant-history-open-conv-1'));
    await waitFor(() => view.getByTestId('assistant-thread'));
    expect(view.getByTestId('assistant-summary')).toHaveTextContent(/420,50/);

    await fireEvent.press(view.getByTestId('assistant-history-open'));
    await waitFor(() => view.getByTestId('assistant-history-delete-conv-1'));
    await fireEvent.press(view.getByTestId('assistant-history-delete-conv-1'));

    await waitFor(() => expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/assistant/conversations/conv-1')).toBe(true));
    expect(confirmAsync).toHaveBeenCalledWith('Söhbəti sil', expect.stringContaining('Pul hara gedir?'));
  });
});
