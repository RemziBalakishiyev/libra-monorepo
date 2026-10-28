import { __resetFocusStore, focusTimer } from '@/hooks/use-focus';
import { elapsedSeconds, readyState, defaultFocusSettings, start } from '@/lib/focus/machine';
import { readOutbox, readTimer, writeTimer } from '@/lib/focus/storage';
import { secureStorage } from '@/lib/secure-storage';
import { useSessionStore } from '@/lib/session-store';

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
const ALICE = 'user-alice';
const BOB = 'user-bob';

/** Requests the store made, so a test can say what reached the network and what did not. */
let posts: { path: string; body: Record<string, unknown> }[] = [];
let online = true;

const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
  posts.push({ path: url.pathname, body });
  if (!online) {
    throw new TypeError('Network request failed');
  }
  return new Response(
    JSON.stringify({
      id: 'server-1',
      clientSessionId: body.clientSessionId,
      taskId: body.taskId ?? null,
      taskTitle: body.taskTitle ?? null,
      configuredSeconds: body.configuredSeconds,
      startedAtUtc: new Date(T0).toISOString(),
      endedAtUtc: new Date(T0 + 60_000).toISOString(),
      activeSeconds: 60,
      outcome: body.outcome,
      createdAtUtc: new Date(T0).toISOString(),
    }),
    { status: 201, headers: { 'content-type': 'application/json' } },
  );
});

describe('the focus timer store', () => {
  beforeEach(async () => {
    posts = [];
    online = true;
    fetchMock.mockClear();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers().setSystemTime(new Date(T0));
    __resetFocusStore();
    for (const key of ['libra.focus.timer', 'libra.focus.outbox', 'libra.focus.settings', 'libra.focus.notification']) {
      await secureStorage.deleteItem(key);
    }
    await useSessionStore.getState().setTokens({ accessToken: 'a', accessTokenExpiresAtUtc: '2026-10-30T00:00:00Z', refreshToken: 'r', refreshTokenExpiresAtUtc: '2026-10-30T00:00:00Z' });
  });

  afterEach(() => {
    __resetFocusStore();
    jest.useRealTimers();
  });

  it('starts a phase, persists it, and keeps running across a reload', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();

    const stored = await readTimer(ALICE);
    expect(stored?.status).toBe('running');

    // A new process adopts the stored phase instead of restarting it at its configured duration.
    jest.setSystemTime(new Date(T0 + 300_000));
    __resetFocusStore();
    await focusTimer.hydrate(ALICE);
    const adopted = await readTimer(ALICE);
    expect(adopted?.status).toBe('running');
    expect(elapsedSeconds(adopted!, T0 + 300_000)).toBe(300);
  });

  it('settles a phase that expired while the app was closed, at its own deadline', async () => {
    await focusTimer.hydrate(ALICE);
    await writeTimer(ALICE, start(readyState(defaultFocusSettings, 'focus', 'session-1'), T0));

    // Reopened two hours later: the run is recorded as the 25 minutes it was, not as two hours.
    jest.setSystemTime(new Date(T0 + 7_200_000));
    __resetFocusStore();
    await focusTimer.hydrate(ALICE);
    await focusTimer.flush();

    const uploaded = posts.filter((call) => call.path === '/api/focus/sessions');
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]!.body).toMatchObject({ clientSessionId: 'session-1', outcome: 'Completed', configuredSeconds: 1500 });
    expect(uploaded[0]!.body.intervals).toEqual([{ startedAtUtc: new Date(T0).toISOString(), endedAtUtc: new Date(T0 + 1_500_000).toISOString() }]);
  });

  it('keeps a finished run when the upload fails, and sends it once when the connection returns', async () => {
    online = false;
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();
    jest.setSystemTime(new Date(T0 + 540_000));
    await focusTimer.finish();
    await focusTimer.flush();

    // The record is durable before anything is sent, so an offline device loses nothing.
    expect(await readOutbox(ALICE)).toHaveLength(1);
    expect((await readOutbox(ALICE))[0]).toMatchObject({ outcome: 'stopped', attempts: 1 });

    online = true;
    await focusTimer.flush();

    expect(await readOutbox(ALICE)).toHaveLength(0);
    expect(posts.filter((call) => call.path === '/api/focus/sessions')).toHaveLength(2);
  });

  it('sends one record per run however many times the outbox is flushed', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();
    jest.setSystemTime(new Date(T0 + 120_000));
    await focusTimer.finish();
    await focusTimer.flush();

    await focusTimer.flush();
    await focusTimer.flush();

    // The first upload retired it; nothing is sent twice, and the server's unique index is the backstop.
    expect(posts.filter((call) => call.path === '/api/focus/sessions')).toHaveLength(1);
    expect(await readOutbox(ALICE)).toHaveLength(0);
  });

  it('never carries one account’s timer or pending records into another', async () => {
    online = false;
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();
    jest.setSystemTime(new Date(T0 + 60_000));
    await focusTimer.finish();
    await focusTimer.flush();
    expect(await readOutbox(ALICE)).toHaveLength(1);

    // Bob signs in on the same installation.
    online = true;
    posts = [];
    await focusTimer.hydrate(BOB);
    await focusTimer.flush();

    expect(await readTimer(BOB)).toBeNull();
    expect(await readOutbox(BOB)).toHaveLength(0);
    // Alice's pending record is still hers, and was not uploaded under Bob's token.
    expect(posts.filter((call) => call.path === '/api/focus/sessions')).toHaveLength(0);
    expect(await readOutbox(ALICE)).toHaveLength(1);
  });

  it('pauses the running phase on sign-out rather than discarding or finishing it', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();
    jest.setSystemTime(new Date(T0 + 180_000));

    await focusTimer.releaseForSignOut();

    const stored = await readTimer(ALICE);
    expect(stored?.status).toBe('paused');
    // The three minutes already spent are kept exactly.
    expect(elapsedSeconds(stored!, T0 + 999_999)).toBe(180);
  });

  it('records a break nowhere: it is never uploaded and never counted', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('shortBreak');
    await focusTimer.start();
    jest.setSystemTime(new Date(T0 + 300_000));
    await focusTimer.reconcile();
    await focusTimer.flush();

    expect(await readOutbox(ALICE)).toHaveLength(0);
    expect(posts.filter((call) => call.path === '/api/focus/sessions')).toHaveLength(0);
  });

  it('will not start a second phase while one is running', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();
    const first = await readTimer(ALICE);

    // A rapid second tap, and an attempt to switch phase mid-run: both leave the run exactly as it is.
    await focusTimer.start();
    await focusTimer.prepare('shortBreak');

    const after = await readTimer(ALICE);
    expect(after?.sessionId).toBe(first?.sessionId);
    expect(after?.phase).toBe('focus');
    expect(after?.status).toBe('running');
  });

  it('applies a settings change to the next phase, never to the one already running', async () => {
    await focusTimer.hydrate(ALICE);
    await focusTimer.prepare('focus');
    await focusTimer.start();

    await focusTimer.saveSettings({ ...defaultFocusSettings, focusSeconds: 50 * 60 });

    expect((await readTimer(ALICE))?.durationSeconds).toBe(1500);

    jest.setSystemTime(new Date(T0 + 1_500_000));
    await focusTimer.reconcile();

    // Every phase is begun explicitly: the break is prepared, started and finished before the next focus run.
    await focusTimer.advance();
    await focusTimer.start();
    await focusTimer.finish();
    await focusTimer.advance();
    expect((await readTimer(ALICE))?.durationSeconds).toBe(3000);
  });
});
