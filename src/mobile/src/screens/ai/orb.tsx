import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Steps in one layer's falloff. Enough that the stacked discs read as light rather than as rings. */
const HALO_STEPS = [1, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28] as const;

const LAYERS = [
  { size: 132, x: -14, y: -10, seconds: 12 },
  { size: 104, x: 16, y: 12, seconds: 9.5 },
  { size: 76, x: -8, y: 14, seconds: 11 },
] as const;

/**
 * The assistant's mark: three soft light layers drifting slowly behind a pistachio core.
 *
 * It is decoration and carries no state — it never indicates progress, thinking or activity, because an orb
 * that appeared to be working would be inventing a request state the app does not have. It stops moving under
 * Reduce Motion and whenever the screen is not being looked at.
 */
export function AssistantOrb({ size = 96, still = false }: { size?: number; still?: boolean }) {
  const { colors } = useTheme();
  const drift = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];

  useEffect(() => {
    drift.forEach((value, index) => {
      cancelAnimation(value);
      if (still) {
        value.set(withTiming(0, { duration: Motion.base, easing: Motion.easeOut }));
        return;
      }
      value.set(withRepeat(withTiming(1, { duration: LAYERS[index]!.seconds * 1000, easing: Easing.inOut(Easing.sin) }), -1, true));
    });
    return () => drift.forEach((value) => cancelAnimation(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  return (
    <View style={[styles.root, { width: size, height: size }]} aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none" testID="assistant-orb">
      {LAYERS.map((layer, index) => (
        <Layer key={layer.size} layer={layer} progress={drift[index]!} tint={colors.heroGlow} scale={size / 96} />
      ))}
      <View style={[styles.core, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15, backgroundColor: colors.accent }]} />
    </View>
  );
}

function Layer({ layer, progress, tint, scale }: { layer: (typeof LAYERS)[number]; progress: SharedValue<number>; tint: string; scale: number }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: layer.x * scale * progress.get() }, { translateY: layer.y * scale * progress.get() }],
  }));
  const size = layer.size * scale;

  return (
    <Animated.View style={[styles.layer, { width: size, height: size }, style]}>
      {HALO_STEPS.map((step) => (
        <View key={step} style={[styles.halo, { width: size * step, height: size * step, borderRadius: (size * step) / 2, backgroundColor: tint, opacity: 0.3 }]} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
  },
  core: {
    opacity: 0.9,
  },
});
