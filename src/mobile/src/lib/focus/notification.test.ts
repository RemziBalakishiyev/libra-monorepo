import * as Notifications from '@/lib/notifications';

import { cancelFocusNotification, clearFocusNotificationForUser, isTapForCurrentPhase, readFocusNotification, requestFocusNotificationPermission, scheduleFocusNotification } from '@/lib/focus/notification';

/** Every value is set per test; only `mock`-prefixed names may be referenced from a jest.mock factory. */
const mockStore = new Map<string, string>();

jest.mock('@/lib/secure-storage', () => ({
  secureStorage: {
    getItem: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    },
    deleteItem: (key: string) => {
      mockStore.delete(key);
      return Promise.resolve();
    },
  },
}));

jest.mock('@/lib/notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4 },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const notifications = jest.mocked(Notifications);
const T0 = '2026-09-30T09:00:00.000Z';
const user = 'user-1';

describe('the focus alarm', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(T0));
    notifications.scheduleNotificationAsync.mockResolvedValue('notification-1');
    notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    notifications.setNotificationChannelAsync.mockResolvedValue(null as never);
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  });

  afterEach(() => jest.useRealTimers());

  it('schedules exactly one alarm for the phase that is running', async () => {
    const record = await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() + 1500 * 1000);

    expect(record).toMatchObject({ userId: user, sessionId: 'session-1', notificationId: 'notification-1' });
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const request = notifications.scheduleNotificationAsync.mock.calls[0]![0];
    expect(request.content.data).toEqual({ kind: 'focus-timer', sessionId: 'session-1', userId: user });
    expect(await readFocusNotification()).not.toBeNull();
  });

  it('replaces its own alarm rather than leaving two, and never cancels anything else', async () => {
    await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() + 600_000);
    notifications.scheduleNotificationAsync.mockResolvedValue('notification-2');
    await scheduleFocusNotification(user, 'session-2', 'shortBreak', Date.now() + 300_000);

    // Only the previous focus alarm was cancelled — by its own stored identifier.
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect((await readFocusNotification())!.notificationId).toBe('notification-2');
  });

  it('cancels on pause, end or phase change and forgets the record', async () => {
    await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() + 600_000);

    await cancelFocusNotification();

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(await readFocusNotification()).toBeNull();

    // Cancelling again asks the OS for nothing: there is no record to act on.
    notifications.cancelScheduledNotificationAsync.mockClear();
    await cancelFocusNotification();
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules nothing for a moment that has already passed', async () => {
    const record = await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() - 1000);

    expect(record).toBeNull();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('leaves the timer working when the device refuses to schedule', async () => {
    notifications.scheduleNotificationAsync.mockRejectedValue(new Error('denied'));

    const record = await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() + 600_000);

    expect(record).toBeNull();
    expect(await readFocusNotification()).toBeNull();
  });

  it('reports a refused permission instead of pretending', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);

    expect(await requestFocusNotificationPermission()).toBe('denied');
  });

  it('forgets only its own account alarm on sign-out', async () => {
    await scheduleFocusNotification(user, 'session-1', 'focus', Date.now() + 600_000);

    await clearFocusNotificationForUser('somebody-else');
    expect(await readFocusNotification()).not.toBeNull();

    await clearFocusNotificationForUser(user);
    expect(await readFocusNotification()).toBeNull();
  });
});

describe('a notification tap', () => {
  const payload = { kind: 'focus-timer', userId: user, sessionId: 'session-1' };

  it('is honoured only for the phase this account is actually running', () => {
    expect(isTapForCurrentPhase(payload, user, 'session-1')).toBe(true);
  });

  it('is ignored when it is stale, from another account, or not ours at all', () => {
    // A tap left over from a phase that has already been settled.
    expect(isTapForCurrentPhase(payload, user, 'session-2')).toBe(false);
    // A tap that belongs to the account that was signed in before.
    expect(isTapForCurrentPhase(payload, 'other-user', 'session-1')).toBe(false);
    // No running phase at all: a stale tap must never create one.
    expect(isTapForCurrentPhase(payload, user, undefined)).toBe(false);
    expect(isTapForCurrentPhase({ kind: 'sleep-reminder', userId: user, sessionId: 'session-1' }, user, 'session-1')).toBe(false);
    expect(isTapForCurrentPhase(null, user, 'session-1')).toBe(false);
  });
});
