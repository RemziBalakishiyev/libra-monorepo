import { useEffect } from 'react';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming, type BaseAnimationBuilder } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EntranceProps = ViewProps & {
  /** Stagger slot: 32 ms per index, capped at `Motion.staggerCap` so a page never waits on a long chain. */
  index?: number;
  /** `below` rises 8 px, `above` drops 8 px, `scale` grows from 0.94, `fade` moves nothing. */
  from?: 'below' | 'above' | 'scale' | 'fade';
  /** Predefined Reanimated exit (FadeOut etc.). Applied to an outer wrapper so it never fights the entrance. */
  exiting?: BaseAnimationBuilder;
  layout?: BaseAnimationBuilder;
  /** Style for the outer wrapper when `exiting`/`layout` are used (absolute placement, flex slots). */
  containerStyle?: StyleProp<ViewStyle>;
  /** Total travel in px for `below`/`above`. */
  distance?: number;
  /** Fade/rise duration in ms (default `Motion.base`); Home's larger blocks use a slightly longer 320 ms. */
  duration?: number;
  /** Skip the animation entirely (e.g. background refetch re-renders). */
  disabled?: boolean;
};

/**
 * Mount entrance driven by a shared value: 220 ms ease-out fade plus an 8 px rise (or a 0.94 → 1 scale).
 * Implemented with `withTiming` rather than a `withInitialValues` builder because Reanimated 4.5's web
 * implementation of custom keyframes re-positions the element absolutely after its cleanup timer.
 * Reduced motion keeps the fade (it explains the state change) and drops translation, scale, and stagger.
 * It only animates on mount: re-renders from background refetches never replay it.
 */
export function Entrance({ index = 0, from = 'below', distance = 8, duration: durationOverride, exiting, layout, containerStyle, disabled = false, style, children, ...rest }: EntranceProps) {
  const { reducedMotion } = useTheme();
  const progress = useSharedValue(disabled ? 1 : 0);

  useEffect(() => {
    if (disabled) {
      progress.set(1);
      return;
    }
    const duration = reducedMotion ? Motion.quick : (durationOverride ?? Motion.base);
    const delay = reducedMotion ? 0 : Math.min(index, Motion.staggerCap) * Motion.stagger;
    progress.set(withDelay(delay, withTiming(1, { duration, easing: Motion.easeOut })));
    // Mount-only by design: the value must not replay when data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.get();
    if (reducedMotion || from === 'fade') {
      return { opacity: value };
    }
    if (from === 'scale') {
      return { opacity: value, transform: [{ scale: 0.94 + 0.06 * value }] };
    }
    const offset = from === 'below' ? distance : -distance;
    return { opacity: value, transform: [{ translateY: (1 - value) * offset }] };
  });

  const inner = (
    <Animated.View style={[style, animatedStyle]} {...rest}>
      {children}
    </Animated.View>
  );

  if (!exiting && !layout) {
    return inner;
  }

  return (
    <Animated.View exiting={exiting} layout={layout} style={containerStyle}>
      {inner}
    </Animated.View>
  );
}
