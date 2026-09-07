import { useMemo } from 'react';
import { FadeOut, FadeOutDown, FadeOutUp, LinearTransition, SlideInDown, SlideOutDown, type BaseAnimationBuilder } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Predefined Reanimated builders shared by every screen. Only predefined animations are used for exits and
 * layout: custom keyframes (`withInitialValues`, `Keyframe`) re-position elements absolutely on web in
 * Reanimated 4.5. Entrances are driven by the `Entrance` component (shared value + timing).
 * Reduced motion keeps opacity changes (they explain a state change) and drops translation and stagger.
 */
export interface MotionSet {
  reduced: boolean;
  duration: (ms: number) => number;
  exit: () => BaseAnimationBuilder;
  exitUp: () => BaseAnimationBuilder;
  exitDown: () => BaseAnimationBuilder;
  sheetIn: () => BaseAnimationBuilder | undefined;
  sheetOut: () => BaseAnimationBuilder;
  /** List reflow after insert or remove. */
  layout: () => BaseAnimationBuilder;
}

export function createMotion(reduced: boolean): MotionSet {
  const duration = (ms: number) => (reduced ? Math.min(ms, Motion.quick) : ms);
  return {
    reduced,
    duration,
    exit: () => FadeOut.duration(duration(Motion.quick)).easing(Motion.easeOut),
    exitUp: () => (reduced ? FadeOut.duration(duration(Motion.quick)) : FadeOutUp.duration(Motion.quick).easing(Motion.easeOut)),
    exitDown: () => (reduced ? FadeOut.duration(duration(Motion.quick)) : FadeOutDown.duration(Motion.quick).easing(Motion.easeOut)),
    sheetIn: () => (reduced ? undefined : SlideInDown.duration(Motion.sheet).easing(Motion.easeSheet)),
    sheetOut: () => (reduced ? FadeOut.duration(duration(Motion.quick)) : SlideOutDown.duration(Motion.move).easing(Motion.easeOut)),
    layout: () => LinearTransition.duration(duration(Motion.move)).easing(Motion.easeInOut),
  };
}

export function useMotion(): MotionSet {
  const { reducedMotion } = useTheme();
  return useMemo(() => createMotion(reducedMotion), [reducedMotion]);
}
