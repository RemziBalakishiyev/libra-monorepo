import { Appearance } from 'react-native';

import { defaultAppearance, isAppearancePreference, resolveScheme, useAppearanceStore } from '@/lib/appearance-store';

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

const STORAGE_KEY = 'libra.appearance';

describe('resolveScheme', () => {
  it('lets an explicit choice ignore the OS entirely', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('follows the OS for system, and reads an unknown OS value as light', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('system', undefined)).toBe('light');
  });
});

describe('useAppearanceStore', () => {
  let setColorScheme: jest.SpyInstance;

  beforeEach(() => {
    mockStore.clear();
    useAppearanceStore.setState({ status: 'loading', preference: defaultAppearance });
    setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
  });

  afterEach(() => setColorScheme.mockRestore());

  it('is light on a fresh install, whatever the phone is set to', async () => {
    await useAppearanceStore.getState().restore();

    expect(useAppearanceStore.getState()).toMatchObject({ status: 'ready', preference: 'light' });
    expect(defaultAppearance).toBe('light');
    // Applied to the platform too, so a dark phone does not leak into native surfaces.
    expect(setColorScheme).toHaveBeenCalledWith('light');
  });

  it('restores a valid stored choice and applies it before the app is shown', async () => {
    mockStore.set(STORAGE_KEY, 'dark');

    await useAppearanceStore.getState().restore();

    expect(useAppearanceStore.getState()).toMatchObject({ status: 'ready', preference: 'dark' });
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('falls back to the default for a value it does not recognise', async () => {
    mockStore.set(STORAGE_KEY, 'sepia');

    await useAppearanceStore.getState().restore();

    expect(useAppearanceStore.getState().preference).toBe('light');
    expect(isAppearancePreference('sepia')).toBe(false);
  });

  it('persists a new choice and applies it at once', async () => {
    await useAppearanceStore.getState().restore();

    await useAppearanceStore.getState().setPreference('dark');

    expect(useAppearanceStore.getState().preference).toBe('dark');
    expect(mockStore.get(STORAGE_KEY)).toBe('dark');
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
    // Choosing a palette never puts the app back behind the loading gate.
    expect(useAppearanceStore.getState().status).toBe('ready');
  });

  it('clears the native override when returning to system, rather than writing the current OS value', async () => {
    await useAppearanceStore.getState().restore();
    await useAppearanceStore.getState().setPreference('dark');

    await useAppearanceStore.getState().setPreference('system');

    // 'unspecified' is what React Native 0.86 treats as "no override". Writing 'light' or 'dark' here would
    // pin the app to today's OS theme and stop it following the phone.
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
    expect(mockStore.get(STORAGE_KEY)).toBe('system');
  });

  it('survives a restart: what was chosen is what comes back', async () => {
    await useAppearanceStore.getState().restore();
    await useAppearanceStore.getState().setPreference('system');

    // A relaunch is a fresh store over the same device storage.
    useAppearanceStore.setState({ status: 'loading', preference: defaultAppearance });
    await useAppearanceStore.getState().restore();

    expect(useAppearanceStore.getState().preference).toBe('system');
  });
});
