import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ToastProvider } from '@/components/toast';
import { __resetFocusStore, focusTimer } from '@/hooks/use-focus';
import { confirmAsync } from '@/lib/confirm';
import { readOutbox, readTimer } from '@/lib/focus/storage';
import { secureStorage } from '@/lib/secure-storage';
import { useSessionStore } from '@/lib/session-store';
import { FocusScreen } from '@/screens/plan/focus';
import { createTestQueryClient } from '@/test/create-test-query-client';
import { jsonResponse } from '@/test/finance-fixtures';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), replace: jest.fn(), back: mockBack, canGoBack: () => true }),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useFocusEffect: (effect: () => void | (() => void)) => require('react').useEffect(effect, [effect]),
}));

jest.mock('@/lib/confirm', () => ({ confirmAsync: jest.fn(() => Promise.resolve(true)) }));

jest.mock('@/lib/notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-1')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve()),
}));

const T0 = Date.parse('2026-09-30T09:00:00.000Z');
const USER = 'user-alice';

describe('FocusScreen', () => {
  const fetchMock = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>();
  let client: QueryClient;
  let calls: { path: string; method: string; body: Record<string, unknown> | undefined }[];

  beforeEach(async () => {
    mockBack.mockReset();
    jest.mocked(confirmAsync).mockClear().mockResolvedValue(true);
    calls = [];
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
      if (url.pathname === '/api/profile') {
        return jsonResponse({ id: USER, email: 'a@b.c', displayName: 'Ayan', preferences: { timeZone: 'Asia/Baku', locale: 'az-AZ', currency: 'AZN' }, createdAtUtc: '2026-01-01T00:00:00Z' });
      }
      if (url.pathname === '/api/focus/sessions') {
        return jsonResponse({ id: 's', clientSessionId: body?.clientSessionId, taskId: null, taskTitle: null, configuredSeconds: 1500, startedAtUtc: '2026-09-30T09:00:00Z', endedAtUtc: '2026-09-30T09:09:00Z', activeSeconds: 540, outcome: 'Stopped', createdAtUtc: '2026-09-30T09:09:00Z' }, 201);
      }
      if (url.pathname.endsWith('/completion')) {
        return jsonResponse({ id: 'task-1', title: 'Hesabatı yaz', note: null, plannedDate: '2026-09-30', plannedTime: null, priority: 'Normal', state: 'Completed', isCompleted: true, completedAtUtc: '2026-09-30T09:10:00Z', isOverdue: false, seriesId: null, seriesKind: null, clientRequestId: null, createdAtUtc: '2026-09-30T08:00:00Z', updatedAtUtc: '2026-09-30T09:10:00Z' });
      }
      throw new TypeError(`No mock for ${url.pathname}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers().setSystemTime(new Date(T0));
    __resetFocusStore();
    for (const key of ['libra.focus.timer', 'libra.focus.outbox', 'libra.focus.settings', 'libra.focus.notification']) {
      await secureStorage.deleteItem(key);
    }
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-30T00:00:00Z' });
    client = createTestQueryClient();
  });

  afterEach(() => {
    client.clear();
    __resetFocusStore();
    jest.useRealTimers();
  });

  function renderScreen() {
    return render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <FocusScreen />
        </ToastProvider>
      </QueryClientProvider>,
    );
  }

  it('offers a ready focus phase at the configured duration', async () => {
    const view = await renderScreen();

    await waitFor(() => expect(view.getByTestId('focus-countdown')).toHaveTextContent('25:00'));
    expect(view.getByTestId('focus-link')).toHaveTextContent('Tapşırıqsız fokus');
    expect(view.getByTestId('focus-title')).toHaveTextContent('Fokusa hazır');
    expect(view.getByTestId('focus-primary')).toHaveTextContent(/Başla/);
    // Nothing is running, so there is nothing to stop.
    expect(view.queryByTestId('focus-stop')).toBeNull();
  });

  it('starts, pauses and resumes without asking for confirmation', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());

    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-primary')).toHaveTextContent(/Pauza/));
    expect(view.getByTestId('focus-title')).toHaveTextContent('Fokus');

    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Pauzadadır'));
    expect(view.getByTestId('focus-primary')).toHaveTextContent(/Davam et/);
    // Ordinary pause and resume are immediate; only stopping the session is confirmed.
    expect(confirmAsync).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-primary')).toHaveTextContent(/Pauza/));
  });

  it('confirms ending early, records the time spent, and does not call it a completed focus', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => view.getByTestId('focus-stop'));

    jest.setSystemTime(new Date(T0 + 540_000));
    await fireEvent.press(view.getByTestId('focus-stop'));

    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Sessiya dayandırıldı'));
    // Confirmed, but not as a deletion: the time spent is kept.
    expect(confirmAsync).toHaveBeenCalledWith('Sessiyanı dayandır', expect.stringContaining('tamamlanmış fokus sayılmayacaq'), 'Dayandır', false);
    // The headline figure is what was focused — never the time that was left on the clock.
    expect(view.getByTestId('focus-countdown')).toHaveTextContent('9 dəqiqə');
    expect(view.getByTestId('focus-countdown')).not.toHaveTextContent(/1[0-9]:/);
    expect(view.getByTestId('focus-figure-label')).toHaveTextContent('fokuslanmış vaxt');
    expect(view.getByTestId('focus-detail')).toHaveTextContent('Planlaşdırılan: 25 dəqiqə');
    // Focusing again is the way forward, and nothing celebrates.
    expect(view.getByTestId('focus-primary')).toHaveTextContent(/Yenidən fokuslan/);

    await focusTimer.flush();
    const uploaded = calls.filter((call) => call.path === '/api/focus/sessions');
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.body).toMatchObject({ outcome: 'Stopped', configuredSeconds: 1500 });
    // The API binds clientSessionId as a Guid: anything else is a 500 on a real device.
    expect(uploaded[0]!.body?.clientSessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('keeps a run when ending is not confirmed', async () => {
    jest.mocked(confirmAsync).mockResolvedValue(false);
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => view.getByTestId('focus-stop'));

    await fireEvent.press(view.getByTestId('focus-stop'));

    await waitFor(() => expect(view.getByTestId('focus-primary')).toHaveTextContent(/Pauza/));
    expect(await readOutbox(USER)).toHaveLength(0);
  });

  it('refuses to switch phase mid-run instead of discarding it', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => view.getByTestId('focus-primary'));
    const before = await readTimer(USER);

    await fireEvent.press(view.getByRole('radio', { name: 'Qısa fasilə' }));

    await waitFor(() => expect(view.getByText('Əvvəlcə cari sessiyanı dayandırın')).toBeTruthy());
    const after = await readTimer(USER);
    expect(after?.sessionId).toBe(before?.sessionId);
    expect(after?.phase).toBe('focus');
    expect(after?.status).toBe('running');
  });

  it('settles an expired phase at its deadline and offers the break as an explicit next step', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('focus-primary'));

    // The phase runs out while the screen is open.
    jest.setSystemTime(new Date(T0 + 1_500_000));
    await focusTimer.reconcile();

    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Fokus tamamlandı'));
    // The headline is the achievement, and the cycle has moved on by exactly one.
    expect(view.getByTestId('focus-countdown')).toHaveTextContent('25 dəqiqə');
    expect(view.getByTestId('focus-figure-label')).toHaveTextContent('tamamlanmış fokus');
    expect(view.getByTestId('focus-cycle-label')).toHaveTextContent('1 / 4 tamamlanmış fokus');
    // The next phase is offered, never started on its own.
    expect(view.getByTestId('focus-primary')).toHaveTextContent(/Fasiləyə başla/);
    expect((await readTimer(USER))?.status).toBe('finished');
  });

  it('completes the linked task only when that is asked for, through the ordinary task mutation', async () => {
    await focusTimer.hydrate(USER);
    await focusTimer.prepare('focus', { taskId: 'task-1', title: 'Hesabatı yaz' });
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-link')).toHaveTextContent('Hesabatı yaz'));

    await fireEvent.press(view.getByTestId('focus-primary'));
    jest.setSystemTime(new Date(T0 + 1_500_000));
    await focusTimer.reconcile();
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Fokus tamamlandı'));

    // Finishing the run did not touch the task.
    expect(calls.some((call) => call.path.endsWith('/completion'))).toBe(false);

    await fireEvent.press(view.getByTestId('focus-complete-task'));

    await waitFor(() => expect(calls.some((call) => call.path === '/api/tasks/task-1/completion')).toBe(true));
    expect(calls.find((call) => call.path.endsWith('/completion'))!.body).toEqual({ completed: true });
  });

  it('keeps the illustration in the scene, decorative and out of the accessibility tree', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());

    // Decorative, so a normal query cannot reach it — only one that includes hidden elements.
    expect(view.queryByTestId('focus-illustration')).toBeNull();
    const illustration = view.getByTestId('focus-illustration', { includeHiddenElements: true });
    expect(illustration.props.accessible).toBe(false);
    expect(illustration.props.resizeMode).toBe('contain');
    expect(illustration.props.style).toMatchObject({ width: 92, height: 144 });

    // It belongs to the scene, so it stays through every state rather than appearing and disappearing.
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-primary')).toHaveTextContent(/Pauza/));
    expect(view.getByTestId('focus-illustration', { includeHiddenElements: true })).toBeTruthy();
  });

  it('gives the six states their own presentation', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    expect(view.getByTestId('focus-title')).toHaveTextContent('Fokusa hazır');

    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Fokus'));

    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Pauzadadır'));

    await fireEvent.press(view.getByTestId('focus-primary'));
    jest.setSystemTime(new Date(T0 + 1_500_000));
    await focusTimer.reconcile();
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Fokus tamamlandı'));

    // The break is its own presentation, and is never called focus.
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => expect(view.getByTestId('focus-title')).toHaveTextContent('Qısa fasilə'));
    expect(view.getByTestId('focus-countdown')).toHaveTextContent('05:00');
    expect(view.getByTestId('focus-cycle-label')).toHaveTextContent('1 / 4 tamamlanmış fokus');
  });

  it('changes the configured duration from the settings sheet', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());

    await fireEvent.press(view.getByTestId('focus-settings-open'));
    await waitFor(() => view.getByTestId('focus-setting-focus'));
    // A whole number of minutes: the field must actually accept what is typed into it.
    await fireEvent.changeText(view.getByTestId('focus-setting-focus'), '50');
    await fireEvent.press(view.getByTestId('focus-settings-save'));

    await waitFor(() => expect(view.getByTestId('focus-countdown')).toHaveTextContent('50:00'));
  });

  it('clamps a duration the domain would refuse', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());

    await fireEvent.press(view.getByTestId('focus-settings-open'));
    await waitFor(() => view.getByTestId('focus-setting-focus'));
    await fireEvent.changeText(view.getByTestId('focus-setting-focus'), '600');
    await fireEvent.press(view.getByTestId('focus-settings-save'));

    // Four hours is the ceiling; ten is stored as four rather than refused at upload time.
    await waitFor(() => expect(view.getByTestId('focus-countdown')).toHaveTextContent('240:00'));
  });

  it('leaves the timer running when the screen is minimised', async () => {
    const view = await renderScreen();
    await waitFor(() => expect(view.getByTestId('focus-primary')).not.toBeDisabled());
    await fireEvent.press(view.getByTestId('focus-primary'));
    await waitFor(() => view.getByTestId('focus-primary'));

    await fireEvent.press(view.getByTestId('focus-minimize'));

    expect(mockBack).toHaveBeenCalled();
    // Navigating away is not stopping: the phase is still running in storage.
    expect((await readTimer(USER))?.status).toBe('running');
  });
});
