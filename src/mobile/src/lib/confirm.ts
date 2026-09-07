import { Alert, Platform } from 'react-native';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
}

type ConfirmHandler = (request: ConfirmRequest) => Promise<boolean>;

let handler: ConfirmHandler | null = null;

/** Installed by `ConfirmProvider`; returns the uninstaller. */
export function registerConfirmHandler(next: ConfirmHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) {
      handler = null;
    }
  };
}

/**
 * Confirmation before destructive actions. Uses the in-app dialog when the provider is mounted; otherwise
 * falls back to the native alert (or window.confirm on web) so callers never hang.
 */
export function confirmAsync(title: string, message: string, confirmLabel = 'Sil', destructive = true): Promise<boolean> {
  if (handler) {
    return handler({ title, message, confirmLabel, destructive });
  }
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Ləğv et', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
