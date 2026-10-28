import { Platform } from 'react-native';

import * as Notifications from '@/lib/notifications';
import { secureStorage } from '@/lib/secure-storage';

/**
 * The one local notification that says a Fokus phase has ended.
 *
 * It is a convenience, never the mechanism: the phase is settled from its stored deadline whenever the app
 * next looks at it, so a notification that is delayed, silenced or never permitted changes nothing about what
 * gets recorded. Nothing here is a background task, and no completion is ever saved from a notification
 * callback.
 *
 * Fokus owns its own stored record, its own Android channel and its own notification identifiers. It never
 * reads, replaces or cancels the sleep reminder — the two features schedule alarms for different reasons and
 * cancelling the wrong one would silently lose the other's.
 *
 * What the operating system decides, and the UI says rather than assumes away:
 * - the exact moment of delivery (Doze on Android, the iOS scheduler) may be a little late;
 * - a notification lives on the device that scheduled it and cannot be cancelled from another;
 * - the browser has none, so on web the feature reports itself unavailable instead of pretending.
 */

export interface FocusNotification {
  userId: string;
  /** The phase this alarm belongs to. A record naming another phase is stale and is cancelled. */
  sessionId: string;
  notificationId: string;
  /** When it is meant to fire, ISO-8601 UTC. */
  firesAtUtc: string;
}

const RECORD_KEY = 'libra.focus.notification';
const ANDROID_CHANNEL = 'focus-timer';

/** A device feature: the browser has no local notifications, and says so instead of failing quietly. */
export const focusNotificationsSupported = Platform.OS === 'ios' || Platform.OS === 'android';

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported';

export async function readFocusNotification(): Promise<FocusNotification | null> {
  try {
    const raw = await secureStorage.getItem(RECORD_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<FocusNotification>;
    return typeof parsed.notificationId === 'string' && typeof parsed.sessionId === 'string' && typeof parsed.userId === 'string' && typeof parsed.firesAtUtc === 'string'
      ? (parsed as FocusNotification)
      : null;
  } catch {
    return null;
  }
}

async function writeRecord(record: FocusNotification | null): Promise<void> {
  try {
    if (record === null) {
      await secureStorage.deleteItem(RECORD_KEY);
      return;
    }
    await secureStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    // Failing to remember the alarm only costs us the ability to cancel it precisely later.
  }
}

/**
 * Asks for permission at the moment the user starts a phase — never at launch.
 *
 * The channel is created first: Android 13 shows its prompt only once the app has a channel, so asking before
 * creating one can produce no dialog at all and a silent denial.
 */
export async function requestFocusNotificationPermission(): Promise<PermissionOutcome> {
  if (!focusNotificationsSupported) {
    return 'unsupported';
  }
  try {
    await ensureChannel();
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

const titles: Record<string, string> = {
  focus: 'Fokus bitdi',
  shortBreak: 'Fasilə bitdi',
  longBreak: 'Uzun fasilə bitdi',
};

const bodies: Record<string, string> = {
  focus: 'Bir fasilə verin və ya növbəti fokusa başlayın.',
  shortBreak: 'Hazır olanda növbəti fokusa başlayın.',
  longBreak: 'Hazır olanda növbəti fokusa başlayın.',
};

/**
 * Schedules exactly one alarm for the phase that is running, replacing any this feature had already scheduled.
 * Returns null when the device refused, and the timer carries on regardless.
 */
export async function scheduleFocusNotification(userId: string, sessionId: string, phase: string, firesAtMs: number): Promise<FocusNotification | null> {
  if (!focusNotificationsSupported) {
    return null;
  }

  await cancelFocusNotification();

  const seconds = Math.round((firesAtMs - Date.now()) / 1000);
  if (seconds <= 0) {
    // The moment has already passed; an alarm for it would fire at once, which is not a reminder.
    return null;
  }

  try {
    await ensureChannel();
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: titles[phase] ?? titles.focus!,
        body: bodies[phase] ?? bodies.focus!,
        // The tap opens Fokus; it never records anything on its own.
        data: { kind: 'focus-timer', sessionId, userId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(firesAtMs) },
    });

    const record: FocusNotification = { userId, sessionId, notificationId, firesAtUtc: new Date(firesAtMs).toISOString() };
    await writeRecord(record);
    return record;
  } catch {
    await writeRecord(null);
    return null;
  }
}

/** Cancels this feature's own alarm. Nothing scheduled by anything else is ever touched. */
export async function cancelFocusNotification(): Promise<void> {
  const stored = await readFocusNotification();
  await writeRecord(null);
  if (!stored || !focusNotificationsSupported) {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(stored.notificationId);
  } catch {
    // Already delivered, already gone, or refused: the record is cleared either way.
  }
}

/** Forgets this account's alarm on sign-out, without cancelling one belonging to another account. */
export async function clearFocusNotificationForUser(userId: string | undefined): Promise<void> {
  const stored = await readFocusNotification();
  if (stored && (!userId || stored.userId === userId)) {
    await cancelFocusNotification();
  }
}

/**
 * Decides whether a notification tap should be acted on.
 *
 * A tap is only ever a request to *look* at the timer. It is honoured when it names the phase this account is
 * actually running; a tap left over from a previous phase, a previous account or a run that has already been
 * settled opens nothing and starts nothing.
 */
export function isTapForCurrentPhase(data: unknown, userId: string | undefined, sessionId: string | undefined): boolean {
  if (!userId || !sessionId || typeof data !== 'object' || data === null) {
    return false;
  }
  const payload = data as { kind?: unknown; userId?: unknown; sessionId?: unknown };
  return payload.kind === 'focus-timer' && payload.userId === userId && payload.sessionId === sessionId;
}

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Fokus taymeri',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch {
    // Without the channel the notification still schedules; it simply carries default importance.
  }
}
