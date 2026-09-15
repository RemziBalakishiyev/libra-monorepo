import { Appearance, type ColorSchemeName } from 'react-native';
import { create } from 'zustand';

import { secureStorage } from '@/lib/secure-storage';

/** What the user chose. `system` means "whatever the phone is set to, now and whenever it changes". */
export type AppearancePreference = 'light' | 'dark' | 'system';

/** What is actually drawn. There is no third value: `system` always resolves to one of these. */
export type ResolvedScheme = 'light' | 'dark';

export const appearancePreferences: readonly AppearancePreference[] = ['light', 'dark', 'system'];

/**
 * A fresh install is light. The design system is light-first (D-044), and a phone that happens to be in dark
 * mode should not decide the first impression; the user can pick dark, or system, in Profile.
 */
export const defaultAppearance: AppearancePreference = 'light';

const STORAGE_KEY = 'libra.appearance';

export function isAppearancePreference(value: unknown): value is AppearancePreference {
  return typeof value === 'string' && (appearancePreferences as readonly string[]).includes(value);
}

/**
 * The one place a preference and the operating system's scheme are combined. An explicit choice ignores the
 * OS entirely — light stays light on a dark phone — and `system` follows it.
 */
export function resolveScheme(preference: AppearancePreference, osScheme: ColorSchemeName | null | undefined): ResolvedScheme {
  if (preference === 'system') {
    return osScheme === 'dark' ? 'dark' : 'light';
  }
  return preference;
}

/**
 * Pushes the choice down to the platform so native surfaces (the keyboard, system pickers, alerts) match the
 * app. On iOS this sets `overrideUserInterfaceStyle` on the windows; on Android it goes through
 * `AppCompatDelegate` and the activity handles `uiMode` in place because `configChanges` includes it.
 *
 * `system` must *clear* the override — in React Native 0.86 that is the string `'unspecified'` — rather than
 * write the current OS value as if it were a choice: a written value would freeze the app on today's OS theme
 * and stop it following the phone.
 *
 * react-native-web has no `setColorScheme`. There the document's `color-scheme` is set instead, which is what
 * the browser's own scrollbars, form controls and default canvas follow; clearing it hands them back to
 * `prefers-color-scheme` for system.
 */
function applyNativeOverride(preference: AppearancePreference): void {
  if (typeof Appearance.setColorScheme === 'function') {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    return;
  }
  if (typeof document !== 'undefined') {
    document.documentElement.style.colorScheme = preference === 'system' ? '' : preference;
  }
}

interface AppearanceState {
  /** `loading` until the stored choice has been read; app content waits for `ready` so it never flashes the wrong theme. */
  status: 'loading' | 'ready';
  preference: AppearancePreference;
  /** Reads the stored preference once at startup and applies it. */
  restore: () => Promise<void>;
  /** Applies a new preference immediately and persists it. */
  setPreference: (preference: AppearancePreference) => Promise<void>;
}

export const useAppearanceStore = create<AppearanceState>((set) => ({
  status: 'loading',
  preference: defaultAppearance,

  async restore() {
    const stored = await readPreference();
    // Only a valid stored value is honoured; anything else — nothing, or a value from a future version — falls
    // back to the default rather than to the OS, so the choice is always one the user could have made here.
    const preference = stored ?? defaultAppearance;
    applyNativeOverride(preference);
    set({ status: 'ready', preference });
  },

  async setPreference(preference) {
    applyNativeOverride(preference);
    // The screen changes now; the write only has to succeed before the next launch.
    set({ preference });
    await secureStorage.setItem(STORAGE_KEY, preference);
  },
}));

async function readPreference(): Promise<AppearancePreference | null> {
  try {
    const raw = await secureStorage.getItem(STORAGE_KEY);
    return isAppearancePreference(raw) ? raw : null;
  } catch {
    return null;
  }
}
