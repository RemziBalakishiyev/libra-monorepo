import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** One light success haptic after a confirmed creation. Never the only feedback; silent on web. */
export function successHaptic(): void {
  if (Platform.OS === 'web') {
    return;
  }
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  } catch {
    // Haptics are optional feedback; a missing native module must never break a submit.
  }
}
