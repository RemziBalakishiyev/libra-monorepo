import * as Notifications from '@/lib/notifications';

import {
  cancelReminder,
  clearRemindersForUser,
  readReminder,
  readReminderSettings,
  reconcileReminder,
  requestReminderPermission,
  scheduleReminder,
  writeReminderSettings,
} from '@/lib/sleep-reminder';

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
const user = 'user-1';
const session = 'sleep-1';
/** The night starts here; every assertion below is relative to this instant, never to the real clock. */
const startedAtUtc = '2026-09-09T22:00:00Z';

describe('sleep reminder', () => {
  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date(startedAtUtc));
    notifications.scheduleNotificationAsync.mockResolvedValue('notification-1');
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    notifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    notifications.setNotificationChannelAsync.mockResolvedValue(null as never);
  });

  afterEach(() => jest.useRealTimers());

  it('schedules one alarm for a session that has already started', async () => {
    const reminder = await scheduleReminder(user, session, startedAtUtc, 480);

    expect(reminder).toMatchObject({ userId: user, sessionId: session, notificationId: 'notification-1', minutes: 480 });
    // Eight hours after the recorded start, not eight hours after the press.
    expect(reminder?.triggerAtUtc).toBe('2026-09-10T06:00:00.000Z');
    const request = notifications.scheduleNotificationAsync.mock.calls[0]![0];
    expect(request.trigger).toEqual({ type: 'date', date: new Date('2026-09-10T06:00:00.000Z') });
    expect(request.content.data).toEqual({ kind: 'sleep-reminder', sessionId: session, userId: user });
  });

  it('replaces an earlier alarm instead of leaving two', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);
    notifications.scheduleNotificationAsync.mockResolvedValue('notification-2');

    await scheduleReminder(user, session, startedAtUtc, 420);

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect((await readReminder())?.notificationId).toBe('notification-2');
  });

  it('refuses a moment that has already passed rather than firing at once', async () => {
    // Started nine hours ago; a seven-hour reminder is two hours overdue.
    const reminder = await scheduleReminder(user, session, '2026-09-09T13:00:00Z', 420);

    expect(reminder).toBeNull();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(await readReminder()).toBeNull();
  });

  it('reports the reminder as off when the device refuses to schedule', async () => {
    notifications.scheduleNotificationAsync.mockRejectedValue(new Error('denied'));

    expect(await scheduleReminder(user, session, startedAtUtc, 480)).toBeNull();
    expect(await readReminder()).toBeNull();
  });

  it('cancels exactly the notification it scheduled', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);

    await cancelReminder();

    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(await readReminder()).toBeNull();
  });

  it('keeps an alarm the system still holds', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([{ identifier: 'notification-1' } as never]);

    expect(await reconcileReminder(user, session, new Date('2026-09-10T02:00:00Z'))).toBe('kept');
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('schedules again, once, when the system lost the alarm but its moment is still ahead', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    notifications.scheduleNotificationAsync.mockResolvedValue('notification-2');

    expect(await reconcileReminder(user, session, new Date('2026-09-10T02:00:00Z'))).toBe('rescheduled');
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect((await readReminder())?.notificationId).toBe('notification-2');
  });

  it('drops an alarm whose moment has passed instead of firing it late', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);

    expect(await reconcileReminder(user, session, new Date('2026-09-10T08:00:00Z'))).toBe('expired');
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(await readReminder()).toBeNull();
  });

  it('cancels an alarm that names a session which is no longer running', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);

    expect(await reconcileReminder(user, undefined, new Date('2026-09-10T02:00:00Z'))).toBe('cancelled');
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
    expect(await readReminder()).toBeNull();
  });

  it('cancels an alarm belonging to a different session or a different user', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);
    expect(await reconcileReminder(user, 'sleep-2', new Date('2026-09-10T02:00:00Z'))).toBe('cancelled');

    await scheduleReminder(user, session, startedAtUtc, 480);
    expect(await reconcileReminder('user-2', session, new Date('2026-09-10T02:00:00Z'))).toBe('cancelled');
  });

  it('does nothing at all when there is no stored alarm', async () => {
    expect(await reconcileReminder(user, session, new Date('2026-09-10T02:00:00Z'))).toBe('none');
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('clears only the signed-out user on logout', async () => {
    await scheduleReminder(user, session, startedAtUtc, 480);

    await clearRemindersForUser('user-2');
    expect(await readReminder()).not.toBeNull();

    await clearRemindersForUser(user);
    expect(await readReminder()).toBeNull();
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notification-1');
  });

  it('keeps each account settings apart', async () => {
    await writeReminderSettings(user, { enabled: true, minutes: 420 });
    await writeReminderSettings('user-2', { enabled: false, minutes: 480 });

    expect(await readReminderSettings(user)).toEqual({ enabled: true, minutes: 420 });
    expect(await readReminderSettings('user-2')).toEqual({ enabled: false, minutes: 480 });
    // An unknown account falls back to the default rather than inheriting someone else's choice.
    expect(await readReminderSettings('user-3')).toEqual({ enabled: false, minutes: 480 });
  });

  it('asks for permission only when it is not already granted', async () => {
    notifications.getPermissionsAsync.mockResolvedValue({ granted: true } as never);
    expect(await requestReminderPermission()).toBe('granted');
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

    notifications.getPermissionsAsync.mockResolvedValue({ granted: false } as never);
    notifications.requestPermissionsAsync.mockResolvedValue({ granted: false } as never);
    expect(await requestReminderPermission()).toBe('denied');
    expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('sleep reminder on Android', () => {
  /**
   * `remindersSupported` and the channel branch are decided from Platform.OS when the module loads, so this
   * suite re-imports it against an Android platform instead of the ios default the jest-expo preset uses.
   */
  function loadOnAndroid() {
    let module!: typeof import('@/lib/sleep-reminder');
    jest.isolateModules(() => {
      // Only Platform is needed here; spreading the real react-native trips its deprecated-export getters.
      jest.doMock('react-native', () => ({ Platform: { OS: 'android', select: (spec: Record<string, unknown>) => spec.android ?? spec.default } }));
      // jest.isolateModules needs a synchronous require; an import would be hoisted out of the mocked scope.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = require('@/lib/sleep-reminder');
    });
    return module;
  }

  beforeEach(() => {
    mockStore.clear();
    jest.clearAllMocks();
  });

  afterEach(() => jest.dontMock('react-native'));

  it('creates the channel before asking for permission', async () => {
    // Android 13 shows its notification prompt only once the app has at least one channel. Asking first can
    // produce no dialog at all, which the user experiences as a switch that silently refuses to turn on.
    const order: string[] = [];
    notifications.setNotificationChannelAsync.mockImplementation(() => {
      order.push('channel');
      return Promise.resolve(null as never);
    });
    notifications.getPermissionsAsync.mockImplementation(() => {
      order.push('permission');
      return Promise.resolve({ granted: true } as never);
    });

    expect(await loadOnAndroid().requestReminderPermission()).toBe('granted');

    expect(order).toEqual(['channel', 'permission']);
  });
});
