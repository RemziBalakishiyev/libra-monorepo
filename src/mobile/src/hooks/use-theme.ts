import { useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Layout, Shadows, palettes, type Palette, type ShadowName } from '@/constants/theme';
import { resolveScheme, useAppearanceStore, type AppearancePreference, type ResolvedScheme } from '@/lib/appearance-store';

export type Scheme = ResolvedScheme;
export type LayoutSize = 'compact' | 'medium' | 'wide';

export interface Theme {
  /** The palette in use, after the user's preference and the OS setting have been combined. */
  scheme: Scheme;
  /** What the user chose in Profile: an explicit palette, or `system`. */
  preference: AppearancePreference;
  colors: Palette;
  shadows: Record<ShadowName, string>;
  /** System reduce-motion setting. Motion helpers read it to drop translation and stagger. */
  reducedMotion: boolean;
  /** compact = phone, medium = tablet / narrow window, wide = desktop web. */
  layout: LayoutSize;
  width: number;
  height: number;
  /** Horizontal page padding for the current layout. */
  pagePadding: number;
}

export function layoutFor(width: number): LayoutSize {
  if (width >= Layout.breakpoints.wide) {
    return 'wide';
  }
  if (width >= Layout.breakpoints.medium) {
    return 'medium';
  }
  return 'compact';
}

/**
 * Resolves the active palette, shadows, reduced-motion preference, and responsive layout size.
 *
 * The palette comes from one place: the stored preference in `useAppearanceStore`, combined with the OS scheme
 * only when that preference is `system`. Every consumer — screens, sheets, toasts, the navigation theme and the
 * status bar — reads it through here, so a change in Profile repaints all of them at once.
 */
export function useTheme(): Theme {
  const osScheme = useColorScheme();
  const preference = useAppearanceStore((state) => state.preference);
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const resolved = resolveScheme(preference, osScheme);
    const layout = layoutFor(width);
    return {
      scheme: resolved,
      preference,
      colors: palettes[resolved],
      shadows: Shadows[resolved],
      reducedMotion,
      layout,
      width,
      height,
      pagePadding: layout === 'compact' ? Layout.phonePadding : Layout.widePadding,
    };
  }, [osScheme, preference, reducedMotion, width, height]);
}
