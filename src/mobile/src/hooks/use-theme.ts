import { useMemo } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Layout, Shadows, palettes, type Palette, type ShadowName } from '@/constants/theme';

export type Scheme = 'light' | 'dark';
export type LayoutSize = 'compact' | 'medium' | 'wide';

export interface Theme {
  scheme: Scheme;
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

/** Resolves the active palette, shadows, reduced-motion preference, and responsive layout size. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const resolved: Scheme = scheme === 'dark' ? 'dark' : 'light';
    const layout = layoutFor(width);
    return {
      scheme: resolved,
      colors: palettes[resolved],
      shadows: Shadows[resolved],
      reducedMotion,
      layout,
      width,
      height,
      pagePadding: layout === 'compact' ? Layout.phonePadding : Layout.widePadding,
    };
  }, [scheme, reducedMotion, width, height]);
}
