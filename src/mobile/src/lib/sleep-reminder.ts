import * as Notifications from '@/lib/notifications';
import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';

/**
 * The optional local wake-up reminder.
 *
 * It is a *local* notification and nothing more: no push service, no background task, no inactivity detection.
 * The device schedules one alarm for one running session, and the app cancels or reschedules it when that
 * session or the setting changes. Everything here degrades quietly — a denied permission or a failed schedule
 * leaves sleep tracking exactly as usable as it was, with the reminder reported as off.
 *
 * Delivery constraints worth knowing, and stated in the UI rather than assumed away:
 * - A scheduled notification lives on the device that scheduled it. Cancelling it from another device is not
 *   possible; the other device's alarm will still fire.
 * - The operating system decides the exact moment. Doze on Android and the iOS scheduler may deliver a little
 *   late, and a device that is off will deliver on the next boot or not at all.
 * - The browser has no equivalent, so on web the reminder is reported as unavailable instead of pretending.
 */
export interface SleepReminder {
  userId: string;
  sessionId: string;
  /** The identifier the OS gave the scheduled notification, needed to cancel exactly this one. */
  notificationId: string;
  /** When it is meant to fire, ISO-8601 UTC. Kept so a resume can tell "already due" from "still pending". */
  triggerAtUtc: string;
  minutes: number;
}

export interface ReminderSettings {
  enabled: boolean;
  /** How long after falling asleep the reminder should fire. */
  minutes: number;
}

/** Durations the user can pick. Kept apart from any sleep goal: this is only when to be woken. */
export const reminderChoices: readonly number[] = [6 * 60, 7 * 60, 7 * 60 + 30, 8 * 60, 9 * 60];

export const defaultReminderSettings: ReminderSettings = { enabled: false, minutes: 8 * 60 };

/** The reminder is a device feature; the browser has none, so the UI says so instead of failing silently. */
export const remindersSupported = Platform.OS === 'ios' || Platform.OS === 'android';

const REMINDER_KEY = 'libra.sleep.reminder';
const SETTINGS_KEY = 'libra.sleep.reminder-settings';
const ANDROID_CHANNEL = 'sleep-reminders';

export async function readReminderSettings(userId: string | undefined): Promise<ReminderSettings> {
  const stored = await readJson<Record<string, ReminderSettings>>(SETTINGS_KEY);
  const settings = userId ? stored?.[userId] : undefined;
  return settings && typeof settings.enabled === 'boolean' && typeof settings.minutes === 'number' ? settings : defaultReminderSettings;
}

/** Settings are stored per user id, so switching accounts never inherits the other account's choice. */
export async function writeReminderSettings(userId: string, settings: ReminderSettings): Promise<void> {
  const stored = (await readJson<Record<string, ReminderSettings>>(SETTINGS_KEY)) ?? {};
  await secureStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...stored, [userId]: settings }));
}

export async function readReminder(): Promise<SleepReminder | null> {
  const stored = await readJson<SleepReminder>(REMINDER_KEY);
  return stored && typeof stored.notificationId === 'string' && typeof stored.sessionId === 'string' ? stored : null;
}

async function writeReminder(reminder: SleepReminder | null): Promise<void> {
  if (reminder === null) {
    await secureStorage.deleteItem(REMINDER_KEY);
    return;
  }
  await secureStorage.setItem(REMINDER_KEY, JSON.stringify(reminder));
}

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported';

/**
 * Asks for permission in the moment the user turns the reminder on — never at launch.
 *
 * The channel is created first. Android 13 shows its notification prompt only once the app has at least one
 * channel, so asking before creating one can produce no dialog at all and a silent "denied": the user taps the
 * switch, nothing appears, and the reminder reports itself off for no visible reason.
 */
export async function requestReminderPermission(): Promise<PermissionOutcome> {
  if (!remindersSupported) {
    return 'unsupported';
  }
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return 'granted';
    }
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Schedules one reminder for a session that has actually started. Returns the stored record, or null when the
 * device refused — the caller then reports the reminder as off rather than claiming one exists.
 */
export async function scheduleReminder(userId: string, sessionId: string, startedAtUtc: string, minutes: number): Promise<SleepReminder | null> {
  if (!remindersSupported) {
    return null;
  }

  // Any earlier alarm for this user is replaced, so a restarted or corrected night never leaves two.
  await cancelReminder();

  const triggerAt = new Date(Date.parse(startedAtUtc) + minutes * 60_000);
  const seconds = Math.round((triggerAt.getTime() - Date.now()) / 1000);
  if (seconds <= 0) {
    // The moment has already passed; scheduling it would fire immediately, which is not a reminder.
    return null;
  }

  try {
    await ensureAndroidChannel();
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Oyanma vaxtıdır',
        body: 'Yuxunu bitirmək üçün Libra-nı açın.',
        // The tap opens the session; it never records waking on its own.
        data: { kind: 'sleep-reminder', sessionId, userId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerAt },
    });

    const reminder: SleepReminder = { userId, sessionId, notificationId, triggerAtUtc: triggerAt.toISOString(), minutes };
    await writeReminder(reminder);
    return reminder;
  } catch {
    // A device that refuses to schedule leaves sleep tracking untouched.
    await writeReminder(null);
    return null;
  }
}

/** Cancels this app's stored sleep reminder. Notifications from anywhere else are never touched. */
export async function cancelReminder(): Promise<void> {
  const stored = await readReminder();
  await writeReminder(null);
  if (!stored || !remindersSupported) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(stored.notificationId);
  } catch {
    // Already gone, or the OS refused: the record is cleared either way.
  }
}

/** Forgets this user's reminder on logout without cancelling anything that is not ours. */
export async function clearRemindersForUser(userId: string | undefined): Promise<void> {
  const stored = await readReminder();
  if (stored && (!userId || stored.userId === userId)) {
    await cancelReminder();
  }
}

export type ReconcileOutcome = 'none' | 'kept' | 'rescheduled' | 'expired' | 'cancelled';

/**
 * Brings the stored record and the operating system back into agreement when the app resumes.
 *
 * - No running session, or one the record does not name: the alarm is cancelled and forgotten.
 * - The alarm is still scheduled and still in the future: left exactly as it is, so nothing fires twice.
 * - The record's alarm is gone but its moment has not passed: scheduled again, once.
 * - Its moment has already passed: the record is dropped without firing — a reminder for a moment that is
 *   over would be a notification about the past.
 */
export async function reconcileReminder(userId: string | undefined, activeSessionId: string | undefined, now: Date = new Date()): Promise<ReconcileOutcome> {
  const stored = await readReminder();
  if (!stored) {
    return 'none';
  }

  if (!userId || stored.userId !== userId || !activeSessionId || stored.sessionId !== activeSessionId) {
    await cancelReminder();
    return 'cancelled';
  }

  if (!remindersSupported) {
    return 'none';
  }

  if (Date.parse(stored.triggerAtUtc) <= now.getTime()) {
    await cancelReminder();
    return 'expired';
  }

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some((request) => request.identifier === stored.notificationId)) {
      return 'kept';
    }

    await ensureAndroidChannel();
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Oyanma vaxtıdır',
        body: 'Yuxunu bitirmək üçün Libra-nı açın.',
        data: { kind: 'sleep-reminder', sessionId: stored.sessionId, userId: stored.userId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(stored.triggerAtUtc) },
    });
    await writeReminder({ ...stored, notificationId });
    return 'rescheduled';
  } catch {
    return 'kept';
  }
}

/** Android needs a channel before anything it delivers has a sound or an importance. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Yuxu xatırlatmaları',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // Without the channel the notification still schedules; it simply carries default importance.
  }
}

async function readJson<TValue>(key: string): Promise<TValue | null> {
  try {
    const raw = await secureStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TValue) : null;
  } catch {
    return null;
  }
}

/**
 * Lets a reminder appear while the app is open. Without a handler, iOS delivers a foreground notification
 * silently — the alarm would fire and the user would see nothing.
 */
export function configureReminderPresentation(): void {
  if (!remindersSupported) {
    return;
  }
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  } catch {
    // An older or partially available module leaves foreground presentation to the system default.
  }
}
