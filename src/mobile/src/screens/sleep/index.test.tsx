import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { useSessionStore } from '@/lib/session-store';
import { SleepScreen } from '@/screens/sleep';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';
import { makeDays, makeOpenSession, makeSession, makeSummary, pagedSessions } from '@/test/sleep-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

/** The device's own leftovers live here, so a "restart" is just a fresh render over the same map. */
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

const mockCancelReminder = jest.fn(() => Promise.resolve());
const mockScheduleReminder = jest.fn(() => Promise.resolve({ notificationId: 'n1' }));
const mockReconcileReminder = jest.fn(() => Promise.resolve('none'));
jest.mock('@/lib/sleep-reminder', () => ({
  remindersSupported: true,
  reminderChoices: [420, 480],
  defaultReminderSettings: { enabled: false, minutes: 480 },
  readReminderSettings: () => Promise.resolve({ enabled: false, minutes: 480 }),
  writeReminderSettings: () => Promise.resolve(),
  requestReminderPermission: () => Promise.resolve('granted'),
  scheduleReminder: (...args: unknown[]) => mockScheduleReminder(...(args as [])),
  cancelReminder: () => mockCancelReminder(),
  reconcileReminder: (...args: unknown[]) => mockReconcileReminder(...(args as [])),
}));

const profile = {
  id: 'user-1',
  email: 'ayan@example.com',
  displayName: 'Ayan',
  createdAtUtc: '2026-09-01T00:00:00Z',
  preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' },
};

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown> | undefined;
}

describe('SleepScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: Call[];

  beforeEach(async () => {
    mockPush.mockReset();
    fetchMock.mockReset();
    mockCancelReminder.mockClear();
    mockScheduleReminder.mockClear();
    mockReconcileReminder.mockClear();
    mockDeviceStore.clear();
    calls = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    await useSessionStore
      .getState()
      .setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-09-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-30T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
    jest.useRealTimers();
  });

  /** Answers the sleep endpoints and records every request the screen makes. */
  function mockApi({
    active = () => new Response(null, { status: 204 }),
    summary = () => jsonResponse(makeSummary()),
    history = () => jsonResponse(pagedSessions([])),
    start,
    stop,
  }: {
    active?: () => Response | Promise<Response>;
    summary?: () => Response | Promise<Response>;
    history?: () => Response | Promise<Response>;
    start?: (attempt: number, body: Record<string, unknown>) => Response | Promise<Response>;
    stop?: (attempt: number, body: Record<string, unknown>) => Response | Promise<Response>;
  } = {}) {
    let starts = 0;
    let stops = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method, body });

      if (url.pathname === '/api/profile') {
        return jsonResponse(profile);
      }
      if (url.pathname === '/api/sleep/active') {
        return active();
      }
      if (url.pathname === '/api/sleep/summary') {
        return summary();
      }
      if (url.pathname === '/api/sleep/sessions' && method === 'GET') {
        return history();
      }
      if (url.pathname === '/api/sleep/start') {
        starts += 1;
        return start ? start(starts, body ?? {}) : jsonResponse(makeOpenSession({ id: 'started' }), 201);
      }
      if (url.pathname.endsWith('/stop')) {
        stops += 1;
        const id = url.pathname.split('/')[4]!;
        return stop ? stop(stops, body ?? {}) : jsonResponse(makeSession({ id, endedAtUtc: String(body?.endedAtUtc) }));
      }
      throw new TypeError(`No mock for ${method} ${url.pathname}`);
    });
  }

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <SleepScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('restores the running session from the server after a restart', async () => {
    // A fresh render with an empty device store is exactly what a relaunch looks like: nothing local says a
    // night is in progress, and the screen still comes back showing one.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T02:30:00Z'));
    const open = makeOpenSession({ id: 'running', startedAtUtc: '2026-09-09T22:00:00Z' });
    mockApi({ active: () => jsonResponse(open), summary: () => jsonResponse(makeSummary({ active: open })) });

    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-active-card')).toBeTruthy());
    // Four and a half hours, derived from the stored start instant — nothing was counted while the app was gone.
    expect(view.getByTestId('sleep-elapsed')).toHaveTextContent(/^4 s 30 d$/);
    expect(view.getByLabelText('Keçən vaxt: 4 saat 30 dəqiqə')).toBeTruthy();
    expect(view.getByTestId('sleep-stop')).toBeTruthy();
  });

  it('recomputes the running figure from the clock, never from an accumulated count', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T00:00:00Z'));
    const open = makeOpenSession({ id: 'running', startedAtUtc: '2026-09-09T22:00:00Z' });
    mockApi({ active: () => jsonResponse(open), summary: () => jsonResponse(makeSummary({ active: open })) });

    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('sleep-elapsed')).toHaveTextContent(/^2 s$/));

    // The device sleeps for three hours; only one tick is delivered, yet the figure follows the clock.
    jest.setSystemTime(new Date('2026-09-10T03:00:00Z'));
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => expect(view.getByTestId('sleep-elapsed')).toHaveTextContent(/^5 s$/));
  });

  it('offers to start a night when nothing is running and sends a retry key', async () => {
    mockApi({ summary: () => jsonResponse(makeSummary({ latest: makeSession({ id: 'last' }) })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-idle-card')).toBeTruthy());
    expect(view.getByTestId('sleep-latest')).toHaveTextContent(/^8 s 30 d$/);

    await fireEvent.press(view.getByTestId('sleep-start'));

    await waitFor(() => expect(calls.filter((call) => call.path === '/api/sleep/start')).toHaveLength(1));
    expect(typeof calls.find((call) => call.path === '/api/sleep/start')!.body!.clientRequestId).toBe('string');
  });

  it('keeps the wake instant the user pressed when the request fails, and retries with that same instant', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T06:00:00Z'));
    const open = makeOpenSession({ id: 'running', startedAtUtc: '2026-09-09T22:00:00Z' });
    mockApi({
      active: () => jsonResponse(open),
      summary: () => jsonResponse(makeSummary({ active: open })),
      stop: (attempt, body) =>
        attempt === 1
          ? jsonResponse({ title: 'Şəbəkə xətası', status: 503 }, 503)
          : jsonResponse(makeSession({ id: 'running', endedAtUtc: String(body.endedAtUtc) })),
    });

    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('sleep-stop')).toBeTruthy());

    await fireEvent.press(view.getByTestId('sleep-stop'));
    await waitFor(() => expect(view.getByTestId('sleep-pending')).toBeTruthy());

    // The wake-up is named with the moment it was captured, not with "now".
    const first = calls.find((call) => call.path.endsWith('/stop'))!;
    expect(first.body!.endedAtUtc).toBe('2026-09-10T06:00:00.000Z');
    // Recording a pending wake cancels the reminder for that night as well.
    expect(mockCancelReminder).toHaveBeenCalled();

    // Two hours later the connection comes back. The recorded duration must not grow by those two hours.
    jest.setSystemTime(new Date('2026-09-10T08:00:00Z'));
    await fireEvent.press(view.getByTestId('sleep-retry-stop'));

    await waitFor(() => expect(calls.filter((call) => call.path.endsWith('/stop'))).toHaveLength(2));
    expect(calls.filter((call) => call.path.endsWith('/stop')).at(-1)!.body!.endedAtUtc).toBe('2026-09-10T06:00:00.000Z');
  });

  it('reads an empty date as no record and names the denominator of the average', async () => {
    mockApi({ summary: () => jsonResponse(makeSummary({ days: makeDays([null, 420, null, 480, null, null, 450]) })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-week')).toBeTruthy());
    expect(view.getByLabelText(/4 sen.*Qeyd yoxdur/)).toBeTruthy();
    expect(view.getByTestId('sleep-average')).toHaveTextContent(/3 gün üzrə/);
  });

  it('lists completed nights and leaves the running one out of the history', async () => {
    const open = makeOpenSession({ id: 'running' });
    mockApi({
      active: () => jsonResponse(open),
      summary: () => jsonResponse(makeSummary({ active: open })),
      history: () => jsonResponse(pagedSessions([open, makeSession({ id: 'done' })])),
    });

    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-row-done')).toBeTruthy());
    expect(view.queryByTestId('sleep-row-running')).toBeNull();
  });

  it('drops a wake-up left over from a session that is no longer running', async () => {
    // The stop went through last time, but the app closed before the record could be cleared. Offering to send
    // it again would be an offer to re-record the past.
    mockDeviceStore.set('libra.sleep.pending-stop', JSON.stringify({ userId: 'user-1', sessionId: 'gone', endedAtUtc: '2026-09-10T06:00:00.000Z' }));
    mockApi({ summary: () => jsonResponse(makeSummary({ latest: makeSession({ id: 'gone' }) })) });

    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-idle-card')).toBeTruthy());
    expect(view.queryByTestId('sleep-pending')).toBeNull();
    await waitFor(() => expect(mockDeviceStore.has('libra.sleep.pending-stop')).toBe(false));
  });

  it('offers the development reminder check only while a session is running, and schedules through the real path', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-10T02:30:00Z'));
    const open = makeOpenSession({ id: 'running', startedAtUtc: '2026-09-09T22:00:00Z' });
    mockApi({ active: () => jsonResponse(open), summary: () => jsonResponse(makeSummary({ active: open })) });

    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('sleep-reminder-test')).toBeTruthy());

    await fireEvent.press(view.getByTestId('sleep-reminder-test'));

    // The same scheduleReminder the real setting uses, attached to the running session, 90 seconds out — so
    // cancelling it with "Oyandım" and reconciling it on resume exercise exactly what ships.
    await waitFor(() => expect(mockScheduleReminder).toHaveBeenCalledTimes(1));
    expect(mockScheduleReminder).toHaveBeenCalledWith('user-1', 'running', '2026-09-10T02:30:00.000Z', 1.5);
  });

  it('hides the development reminder check when no session is running', async () => {
    mockApi({ summary: () => jsonResponse(makeSummary({ latest: makeSession({ id: 'last' }) })) });
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('sleep-idle-card')).toBeTruthy());
    expect(view.queryByTestId('sleep-reminder-test')).toBeNull();
  });

  it('reconciles the stored reminder with the system once the running session is known', async () => {
    const open = makeOpenSession({ id: 'running' });
    mockApi({ active: () => jsonResponse(open), summary: () => jsonResponse(makeSummary({ active: open })) });

    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('sleep-active-card')).toBeTruthy());

    await waitFor(() => expect(mockReconcileReminder).toHaveBeenCalledWith('user-1', 'running'));
  });
});
