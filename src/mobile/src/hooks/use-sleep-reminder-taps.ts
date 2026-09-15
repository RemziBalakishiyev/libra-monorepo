import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useProfile } from '@/hooks/use-profile';
import * as Notifications from '@/lib/notifications';
import { configureReminderPresentation, remindersSupported } from '@/lib/sleep-reminder';

/** The payload `scheduleReminder` attaches. Anything without it belongs to another app or another feature. */
function sleepReminderOwner(response: Notifications.NotificationResponse | null | undefined): string | null {
  const data = response?.notification.request.content.data;
  if (!data || data.kind !== 'sleep-reminder') {
    return null;
  }
  return typeof data.userId === 'string' ? data.userId : null;
}

/**
 * Opens the sleep screen when the signed-in user taps their own wake-up reminder — and does nothing else.
 *
 * Tapping the notification never records waking. The instant a wake-up is stored has to be the moment the user
 * says they woke, and a notification tap says only that they looked at their phone. The screen it opens has
 * "Oyandım" on it; pressing that is what records the time.
 *
 * The hook lives inside the signed-in route group, so it cannot run until the stored session has been restored;
 * a tap that launched the app from cold is therefore acted on after authentication, not before. It is also
 * matched against the account that is actually signed in: the launch response the operating system reports is
 * the most recent one and outlives a sign-out, so after switching accounts a tap left behind by the previous
 * user is ignored rather than steering the new one. The session id in the payload is never used to fetch
 * anything — the screen resolves the running session from the server for whoever is signed in.
 *
 * A tap that launched the app from cold is read once through `getLastNotificationResponseAsync`; taps while the
 * app is running arrive through the listener. Both go through the same guard, so a relaunch cannot navigate
 * twice for the same tap.
 */
export function useSleepReminderTaps(): void {
  const router = useRouter();
  const profile = useProfile();
  const userId = profile.data?.id;
  const handled = useRef<string | null>(null);

  useEffect(() => {
    // Without a known account there is nobody to check the notification against, so nothing is acted on yet.
    if (!remindersSupported || !userId) {
      return;
    }

    configureReminderPresentation();

    let cancelled = false;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (cancelled || sleepReminderOwner(response) !== userId || response === null) {
        return;
      }
      const identifier = response.notification.request.identifier;
      if (handled.current === identifier) {
        return;
      }
      handled.current = identifier;
      router.push('/sleep');
    };

    void Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => {
        // A device that cannot report the launch tap simply opens the app normally.
      });
    const subscription = Notifications.addNotificationResponseReceivedListener(open);

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [router, userId]);
}
