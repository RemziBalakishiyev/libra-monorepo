import { act, renderHook } from '@testing-library/react-native';

import { palettes } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { defaultAppearance, useAppearanceStore } from '@/lib/appearance-store';

/**
 * The operating system's scheme, as React Native's `useColorScheme` reports it. Mocked at the module React
 * Native itself re-exports, so the hook under test is the real one; changing this value and re-rendering is
 * what an OS appearance change looks like to a subscriber.
 */
let mockOsScheme: 'light' | 'dark' | null = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockOsScheme,
}));

jest.mock('@/lib/secure-storage', () => ({
  secureStorage: { getItem: () => Promise.resolve(null), setItem: () => Promise.resolve(), deleteItem: () => Promise.resolve() },
}));

describe('useTheme', () => {
  beforeEach(() => {
    mockOsScheme = 'light';
    useAppearanceStore.setState({ status: 'ready', preference: defaultAppearance });
  });

  it('stays light when the phone is dark and Light was chosen', async () => {
    mockOsScheme = 'dark';
    useAppearanceStore.setState({ preference: 'light' });

    const { result } = await renderHook(() => useTheme());

    expect(result.current.scheme).toBe('light');
    expect(result.current.colors).toBe(palettes.light);
  });

  it('stays dark when the phone is light and Dark was chosen', async () => {
    mockOsScheme = 'light';
    useAppearanceStore.setState({ preference: 'dark' });

    const { result } = await renderHook(() => useTheme());

    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors).toBe(palettes.dark);
  });

  it('follows the phone under System, including when the phone changes while the app is open', async () => {
    useAppearanceStore.setState({ preference: 'system' });
    mockOsScheme = 'light';
    const { result, rerender } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');

    // The phone switches to dark — say, the user comes back from the background after sunset.
    mockOsScheme = 'dark';
    await act(async () => rerender({}));

    expect(result.current.scheme).toBe('dark');
    expect(result.current.colors).toBe(palettes.dark);
  });

  it('repaints every consumer the moment the choice changes, without remounting', async () => {
    useAppearanceStore.setState({ preference: 'light' });
    const { result } = await renderHook(() => useTheme());
    expect(result.current.scheme).toBe('light');

    await act(async () => {
      await useAppearanceStore.getState().setPreference('dark');
    });

    expect(result.current.scheme).toBe('dark');
    expect(result.current.preference).toBe('dark');
  });

  it('keeps the white onHero foreground in both palettes', () => {
    // The hero's white text is a deliberate exception to the light/dark swap (D-044); a palette change must
    // never darken it.
    expect(palettes.light.onHero).toBe(palettes.dark.onHero);
    expect(palettes.light.onHero.toUpperCase()).toBe('#FFFFFF');
  });
});
