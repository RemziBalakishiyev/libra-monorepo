/**
 * The browser has no local notification scheduler of this kind, so nothing here schedules anything.
 *
 * `remindersSupported` is false on web and every caller checks it first; these implementations exist only so the
 * module resolves, and so the browser bundle never pulls in the native library (see `notifications.ts`).
 * The type-only import below is erased at build time and adds no runtime dependency.
 */
import type * as ExpoNotifications from 'expo-notifications';

export type NotificationResponse = ExpoNotifications.NotificationResponse;

export const SchedulableTriggerInputTypes = { DATE: 'date' } as const;
export const AndroidImportance = { HIGH: 4 } as const;

export function setNotificationHandler(): void {}

export function addNotificationResponseReceivedListener(): { remove: () => void } {
  return { remove: () => {} };
}

export function getLastNotificationResponseAsync(): Promise<NotificationResponse | null> {
  return Promise.resolve(null);
}

export function getPermissionsAsync(): Promise<{ granted: boolean }> {
  return Promise.resolve({ granted: false });
}

export function requestPermissionsAsync(): Promise<{ granted: boolean }> {
  return Promise.resolve({ granted: false });
}

export function scheduleNotificationAsync(): Promise<string> {
  return Promise.reject(new Error('Local notifications are not available in the browser.'));
}

export function cancelScheduledNotificationAsync(): Promise<void> {
  return Promise.resolve();
}

export function getAllScheduledNotificationsAsync(): Promise<never[]> {
  return Promise.resolve([]);
}

export function setNotificationChannelAsync(): Promise<null> {
  return Promise.resolve(null);
}
