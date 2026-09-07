import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Credential storage. Native platforms use the OS keychain/keystore through expo-secure-store.
 *
 * Expo Web has no secure storage. The localStorage fallback below exists ONLY so the app can be exercised
 * in a browser during development and testing: localStorage is readable by any script on the origin (XSS).
 * If a production web client is ever released, browser authentication must be redesigned (for example
 * HttpOnly, Secure, SameSite cookies issued by the API with CSRF protection) instead of storing tokens here.
 * See docs/DECISIONS.md D-024.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return readWeb(key);
    }
    return SecureStore.getItemAsync(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      writeWeb(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },

  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      writeWeb(key, null);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

function readWeb(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeWeb(key: string, value: string | null): void {
  try {
    if (value === null) {
      globalThis.localStorage?.removeItem(key);
    } else {
      globalThis.localStorage?.setItem(key, value);
    }
  } catch {
    // Storage may be unavailable (private mode); the session then lives only in memory.
  }
}
