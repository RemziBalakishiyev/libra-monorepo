/**
 * The slice of `expo-notifications` this app uses, behind one module.
 *
 * The indirection exists so the browser bundle never loads the library at all: importing it on web pulls in its
 * push-token auto-registration side effect, which warns that push tokens are unsupported there. Sleep reminders
 * are a device feature; see `notifications.web.ts` for the honest no-op the browser gets instead.
 */
export {
  AndroidImportance,
  SchedulableTriggerInputTypes,
  addNotificationResponseReceivedListener,
  cancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync,
  getLastNotificationResponseAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
} from 'expo-notifications';

export type { NotificationResponse } from 'expo-notifications';
