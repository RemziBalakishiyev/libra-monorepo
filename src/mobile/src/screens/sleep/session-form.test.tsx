import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { SleepFormScreen } from '@/screens/sleep/session-form';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { makeOpenSession, makeSession } from '@/test/sleep-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
}));

const mockConfirm = jest.fn<Promise<boolean>, [string, string]>(() => Promise.resolve(true));
jest.mock('@/lib/confirm', () => ({ confirmAsync: (title: string, message: string) => mockConfirm(title, message) }));

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

/** Local wall-clock helpers: the form edits local dates and times, whatever zone the machine runs in. */
function localIso(year: number, month: number, day: number, hours: number, minutes: number): string {
  return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
}

describe('SleepFormScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockBack.mockReset();
    mockConfirm.mockClear();
    mockConfirm.mockResolvedValue(true);
    fetchMock.mockReset();
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-30T00:00:00Z' });
    client = createTestQueryClient();
    // Fixed "now" so the default night (the eight hours before it) is always in the past.
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 10, 12, 0, 0));
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
  });

  function mockApi({
    session,
    save,
  }: {
    session?: () => Response | Promise<Response>;
    save?: (attempt: number, body: Record<string, unknown>) => Response | Promise<Response>;
  } = {}) {
    let saves = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method, body });

      if (method === 'GET' && url.pathname.startsWith('/api/sleep/sessions/')) {
        return session ? session() : jsonResponse(makeSession());
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (method === 'POST' || method === 'PUT') {
        saves += 1;
        return save ? save(saves, body ?? {}) : jsonResponse(makeSession(), method === 'POST' ? 201 : 200);
      }
      throw new TypeError(`No mock for ${method} ${url.pathname}`);
    });
  }

  function renderForm(id?: string) {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SleepFormScreen id={id} />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('records a night by hand from two local moments, with no rating required', async () => {
    mockApi();
    const view = await renderForm();

    await waitFor(() => expect(view.getByTestId('sleep-form-duration')).toHaveTextContent(/^Müddət: 8 s$/));
    await fireEvent.press(view.getByTestId('sleep-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
    const request = calls.find((call) => call.method === 'POST')!;
    expect(request.body).toMatchObject({
      startedAtUtc: localIso(2026, 9, 10, 4, 0),
      endedAtUtc: localIso(2026, 9, 10, 12, 0),
      // The rating is genuinely optional: nothing about it blocks the record.
      quality: null,
      note: null,
    });
    expect(typeof request.body!.clientRequestId).toBe('string');
  });

  it('keeps everything typed when the server refuses the save', async () => {
    mockApi({ save: () => jsonResponse({ title: 'Bu vaxt aralığı başqa bir yuxu ilə kəsişir.', status: 409 }, 409) });
    const view = await renderForm();
    await waitFor(() => view.getByTestId('sleep-note'));

    await fireEvent.changeText(view.getByTestId('sleep-note'), 'Gecə iki dəfə oyandım');
    await fireEvent.press(view.getByTestId('sleep-submit'));

    await waitFor(() => expect(view.getByText('Bu vaxt aralığı başqa bir yuxu ilə kəsişir.')).toBeTruthy());
    // Nothing has to be entered twice, and the screen has not navigated away.
    expect(view.getByTestId('sleep-note').props.value).toBe('Gecə iki dəfə oyandım');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('names the quality in words, never by number alone', async () => {
    mockApi();
    const view = await renderForm();
    await waitFor(() => view.getByTestId('sleep-quality'));

    await fireEvent.press(view.getByLabelText('4 — Yaxşı'));

    await waitFor(() => expect(view.getByTestId('sleep-quality-label')).toHaveTextContent(/^Yaxşı$/));
    await fireEvent.press(view.getByTestId('sleep-submit'));
    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'POST')!.body!.quality).toBe(4);
  });

  it('sends the version it read when correcting, so a stale edit can be refused', async () => {
    mockApi({ session: () => jsonResponse(makeSession({ id: 'done', updatedAtUtc: '2026-09-10T04:00:00Z' })) });
    const view = await renderForm('done');
    await waitFor(() => view.getByTestId('sleep-submit'));

    await fireEvent.press(view.getByTestId('sleep-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PUT')!.body!.expectedUpdatedAtUtc).toBe('2026-09-10T04:00:00Z');
  });

  it('never trims a forgotten night, and lets a correction close it', async () => {
    // Started three days ago and never ended. Its length is left exactly as recorded until the user fixes it.
    mockApi({ session: () => jsonResponse(makeOpenSession({ id: 'forgotten', startedAtUtc: new Date(2026, 8, 7, 23, 0).toISOString() })) });
    const view = await renderForm('forgotten');

    await waitFor(() => expect(view.getByTestId('sleep-open-notice')).toBeTruthy());
    // It opens as still running: nothing is proposed as its end until the user says so.
    expect(view.getByTestId('sleep-close-open')).toBeTruthy();

    await fireEvent.press(view.getByTestId('sleep-close-open'));
    await waitFor(() => expect(view.getByTestId('sleep-form-duration')).toBeTruthy());
    await fireEvent.press(view.getByTestId('sleep-submit'));

    // Sixty-one hours is refused outright rather than silently cut back to the limit, and the session is left
    // untouched — it is still there to be corrected or discarded.
    await waitFor(() => expect(view.getByText('Bir yuxu ən çox 24 saat ola bilər.')).toBeTruthy());
    expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(0);
    expect(view.getByTestId('sleep-form-delete')).toBeTruthy();
  });

  it('closes a running night at a real wake time and keeps its start', async () => {
    mockApi({ session: () => jsonResponse(makeOpenSession({ id: 'running', startedAtUtc: new Date(2026, 8, 10, 2, 0).toISOString() })) });
    const view = await renderForm('running');
    await waitFor(() => view.getByTestId('sleep-close-open'));

    // The wake fields start at the present moment, and the length is shown before anything is sent.
    await fireEvent.press(view.getByTestId('sleep-close-open'));
    await waitFor(() => expect(view.getByTestId('sleep-form-duration')).toHaveTextContent(/^Müddət: 10 s$/));
    await fireEvent.press(view.getByTestId('sleep-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    const request = calls.find((call) => call.method === 'PUT')!;
    expect(request.body!.startedAtUtc).toBe(localIso(2026, 9, 10, 2, 0));
    expect(request.body!.endedAtUtc).toBe(localIso(2026, 9, 10, 12, 0));
  });

  it('can correct a running night and leave it running', async () => {
    mockApi({ session: () => jsonResponse(makeOpenSession({ id: 'running', startedAtUtc: new Date(2026, 8, 10, 2, 0).toISOString() })) });
    const view = await renderForm('running');
    await waitFor(() => view.getByTestId('sleep-close-open'));

    await fireEvent.press(view.getByTestId('sleep-submit'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'PUT')).toHaveLength(1));
    expect(calls.find((call) => call.method === 'PUT')!.body!.endedAtUtc).toBeNull();
  });

  it('names the interval in the confirmation before discarding it', async () => {
    mockApi({ session: () => jsonResponse(makeSession({ id: 'done' })) });
    const view = await renderForm('done');
    await waitFor(() => view.getByTestId('sleep-form-delete'));

    await fireEvent.press(view.getByTestId('sleep-form-delete'));

    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(mockConfirm.mock.calls[0]![1]).toMatch(/–/);
    await waitFor(() => expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1));
  });
});
