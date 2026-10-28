import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { ProgressRing } from '@/components/progress-ring';
import { AppText } from '@/components/text';
import { Motion, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { FocusPresentation } from '@/lib/focus/presentation';

/** The illustration at scene size, from a derivative cut to three times its display height. */
const HOURGLASS_HEIGHT = 144;
const HOURGLASS_WIDTH = 92;
const hourglass = require('../../../assets/images/focus-hourglass-scene.png');

const RING_SIZE = 196;
const RING_THICKNESS = 5;

/** The three soft lights that drift behind the scene, largest first. */
const LIGHTS = [
  { size: 360, left: -120, top: -130, drift: { x: 20, y: 16 }, seconds: 13 },
  { size: 300, right: -110, top: 30, drift: { x: -16, y: 20 }, seconds: 11 },
  { size: 260, left: 10, bottom: -110, drift: { x: 14, y: -14 }, seconds: 12 },
] as const;

type FocusSceneProps = {
  view: FocusPresentation;
  cycle: { filled: boolean; active: boolean }[];
  cycleLabel: string;
  /** Stops every decorative loop: reduced motion, a backgrounded app, or a screen that is not focused. */
  still: boolean;
  /** Plays once when a focus run completes on its own. Never on an early stop. */
  celebrateKey: number;
};

/**
 * The focus scene: one deep forest surface holding the light, the hourglass, the ring, the countdown and the
 * cycle markers as a single composition rather than four unrelated pieces.
 *
 * Every loop in here is decoration and nothing else. The ring is driven by the real share the timer reports,
 * the countdown is the real figure, and no animation callback ever advances or records anything — the worst a
 * frozen scene can do is look still.
 */
export function FocusScene({ view, cycle, cycleLabel, still, celebrateKey }: FocusSceneProps) {
  const { colors } = useTheme();
  const moving = view.ambient && !still;

  // ── Ambient light. One shared value per layer, each on its own period so they never beat together. ────
  const drift = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  useEffect(() => {
    drift.forEach((value, index) => {
      cancelAnimation(value);
      if (!moving) {
        // Settling to rest rather than snapping keeps a pause from looking like a glitch.
        value.set(withTiming(0, { duration: Motion.base, easing: Motion.easeOut }));
        return;
      }
      const seconds = LIGHTS[index]!.seconds;
      value.set(withRepeat(withTiming(1, { duration: seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
    });
    return () => drift.forEach((value) => cancelAnimation(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  // ── The hourglass floats and tilts a degree or two, with its shadow following. ─────────────────────────
  const float = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(float);
    if (!moving) {
      float.set(withTiming(0, { duration: Motion.base, easing: Motion.easeOut }));
      return;
    }
    float.set(withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(float);
  }, [moving, float]);

  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 * float.get() }, { rotateZ: `${-1.5 + 3 * float.get()}deg` }],
  }));
  // The shadow shrinks and softens as the illustration rises, which is what sells the lift.
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.30 - 0.12 * float.get(),
    transform: [{ scaleX: 1 - 0.12 * float.get() }],
  }));

  // ── Pausing softens the whole scene's illumination rather than stopping at full brightness. ───────────
  const lit = useDerivedValue(() => withTiming(view.kind === 'paused' ? 0.45 : 1, { duration: Motion.move, easing: Motion.easeOut }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: lit.get() }));

  // ── One short ring pulse when a run completes on its own. ─────────────────────────────────────────────
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (celebrateKey === 0 || still) {
      return;
    }
    pulse.set(0);
    pulse.set(withSequence(withTiming(1, { duration: 260, easing: Motion.easeOut }), withDelay(120, withTiming(0, { duration: 420, easing: Motion.easeOut }))));
  }, [celebrateKey, still, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * pulse.get(),
    transform: [{ scale: 1 + 0.12 * pulse.get() }],
  }));

  return (
    <View style={[styles.scene, { backgroundColor: colors.heroGradientEnd }]} testID="focus-scene">
      {/* Decorative light. Hidden from readers, and never in the way of a touch. */}
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
        {LIGHTS.map((light, index) => (
          <Light key={light.size} light={light} progress={drift[index]!} tint={colors.heroGlow} />
        ))}
      </Animated.View>

      <View style={styles.stack}>
        <View style={styles.illustration} aria-hidden importantForAccessibility="no-hide-descendants">
          {/* The shadow gets the same stepped falloff as the light, or it reads as a hard dark bar. */}
          <Animated.View style={[styles.shadowSlot, shadowStyle]}>
            {[1, 0.78, 0.56].map((scale) => (
              <View key={scale} style={[styles.shadow, { width: HOURGLASS_WIDTH * 0.78 * scale, backgroundColor: colors.heroGradientStart, opacity: 0.18 }]} />
            ))}
          </Animated.View>
          <Animated.View style={floatStyle}>
            <Image source={hourglass} style={styles.hourglass} resizeMode="contain" accessible={false} fadeDuration={0} testID="focus-illustration" />
          </Animated.View>
        </View>

        <View style={styles.dial}>
          <Animated.View style={[styles.pulse, { borderColor: colors.accent }, pulseStyle]} pointerEvents="none" />
          <ProgressRing
            percent={view.progress * 100}
            size={RING_SIZE}
            thickness={RING_THICKNESS}
            color={colors.accent}
            trackColor="rgba(255, 255, 255, 0.14)"
            surfaceColor={colors.heroGradientEnd}
            endpoint={view.kind === 'running' || view.kind === 'paused'}
            accessibilityLabel={view.spoken}
            testID="focus-ring">
            <View style={styles.readout}>
              {/* A clock gets the full display size; a spelled-out result gets a size that fits the ring. */}
              <AppText
                style={[view.figureKind === 'clock' ? styles.countdown : styles.resultFigure, { color: colors.onHero }]}
                numberOfLines={2}
                testID="focus-countdown">
                {view.figure}
              </AppText>
              <AppText variant="caption" style={{ color: colors.onHeroMuted }} testID="focus-figure-label">
                {view.figureLabel}
              </AppText>
            </View>
          </ProgressRing>
        </View>

        <View style={styles.cycle} accessible accessibilityLabel={cycleLabel} testID="focus-cycle">
          <View style={styles.markers}>
            {cycle.map((marker, index) => (
              <Marker key={index} filled={marker.filled} active={marker.active} />
            ))}
          </View>
          <AppText variant="caption" style={{ color: colors.onHeroMuted }} testID="focus-cycle-label">
            {cycleLabel}
          </AppText>
        </View>
      </View>
    </View>
  );
}

/** Steps in one light's falloff, largest first. Eight is enough that the bands stop being visible. */
const HALO_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.28] as const;

/**
 * One drifting light.
 *
 * A flat circle reads as a disc with a hard edge, not as light, and three stacked circles at the glow token's
 * own alpha read as a bullseye. Eight concentric steps, each rendered at about a fifth of that alpha, add up
 * to a soft centre and a nearly invisible edge — the same trick as the Home hero's glow, with enough steps
 * for a surface this size. Stacked discs rather than a gradient because gradients are not guaranteed on every
 * platform this app runs on.
 */
function Light({ light, progress, tint }: { light: (typeof LIGHTS)[number]; progress: SharedValue<number>; tint: string }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: light.drift.x * progress.get() }, { translateY: light.drift.y * progress.get() }],
  }));
  const { size } = light;

  return (
    <Animated.View
      style={[
        styles.light,
        {
          width: size,
          height: size,
          left: 'left' in light ? light.left : undefined,
          right: 'right' in light ? light.right : undefined,
          top: 'top' in light ? light.top : undefined,
          bottom: 'bottom' in light ? light.bottom : undefined,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      {HALO_STEPS.map((scale) => (
        <View
          key={scale}
          style={[styles.halo, { width: size * scale, height: size * scale, borderRadius: (size * scale) / 2, backgroundColor: tint, opacity: 0.22 }]}
        />
      ))}
    </Animated.View>
  );
}

/** One cycle marker: a filled pip for a completed run, a ring for the one under way. */
function Marker({ filled, active }: { filled: boolean; active: boolean }) {
  const { colors, reducedMotion } = useTheme();
  const emphasis = useDerivedValue(() => withTiming(active ? 1 : 0, { duration: reducedMotion ? 0 : Motion.move, easing: Motion.easeOut }));
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.25 * emphasis.get() }] }));

  return (
    <Animated.View
      style={[
        styles.marker,
        {
          backgroundColor: filled ? colors.accent : 'transparent',
          borderColor: filled || active ? colors.accent : 'rgba(255, 255, 255, 0.28)',
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  scene: {
    borderRadius: 32,
    borderCurve: 'continuous',
    overflow: 'hidden',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  light: {
    position: 'absolute',
  },
  halo: {
    position: 'absolute',
  },
  stack: {
    alignItems: 'center',
    gap: Spacing.lg,
  },
  illustration: {
    height: HOURGLASS_HEIGHT,
    width: HOURGLASS_WIDTH,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  shadowSlot: {
    position: 'absolute',
    bottom: -1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    position: 'absolute',
    height: 9,
    borderRadius: 999,
  },
  hourglass: {
    width: HOURGLASS_WIDTH,
    height: HOURGLASS_HEIGHT,
  },
  dial: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  readout: {
    alignItems: 'center',
    gap: 2,
  },
  countdown: {
    fontVariant: ['tabular-nums'],
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '700',
    letterSpacing: -1,
  },
  resultFigure: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: RING_SIZE - 56,
  },
  cycle: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  markers: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  marker: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
