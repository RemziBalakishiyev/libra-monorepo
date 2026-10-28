import { useEffect } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const illustration = require('../../../assets/images/libra-balance-hero.png');

/** The illustration's slot: reserved before the bitmap decodes, so the hero never jumps. */
const ILLUSTRATION = 124;
const FLOAT_DISTANCE = 3;
const FLOAT_HALF_PERIOD_MS = 3500;
/** Largest first; each disc adds the same low alpha, so the centre is brightest and the edge fades in steps. */
const GLOW_DISCS = [
  { size: 330, right: -95, top: -110 },
  { size: 240, right: -50, top: -65 },
  { size: 160, right: -10, top: -20 },
] as const;

type HomeHeroProps = {
  /** One concise line from real data ("Bu gün 2 tapşırıq qalıb"), or the neutral empty-state sentence. */
  supportingLine: string;
  /** Opens the global Quick Add flow. Absent on layouts whose sidebar already offers it. */
  onQuickAdd?: () => void;
  /** Whether Home is in view and the app is in the foreground; the decorative float only runs then. */
  focused: boolean;
};

/**
 * The Home hero: a deep-green rounded surface with one restrained tonal glow and the balance illustration on
 * the right. The heading, the supporting line and the action always sit on the solid dark area, so contrast does
 * not depend on the glow or the picture. The illustration drifts 3 px over seven seconds — and only while Home is
 * focused, the app is in the foreground and the system allows motion.
 */
export function HomeHero({ supportingLine, onQuickAdd, focused }: HomeHeroProps) {
  const { colors, shadows, reducedMotion, width } = useTheme();
  const drift = useSharedValue(0);
  // On a narrow window (or enlarged text, which narrows the logical width) the action moves under the row so
  // its label never wraps beside the illustration.
  const stacked = width < 340;

  useEffect(() => {
    if (!focused || reducedMotion) {
      cancelAnimation(drift);
      drift.set(withTiming(0, { duration: 200 }));
      return;
    }
    let running = true;
    const start = () => {
      if (!running) {
        return;
      }
      drift.set(withRepeat(withSequence(withTiming(-FLOAT_DISTANCE, { duration: FLOAT_HALF_PERIOD_MS, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: FLOAT_HALF_PERIOD_MS, easing: Easing.inOut(Easing.sin) })), -1, false));
    };
    const stop = () => {
      cancelAnimation(drift);
      drift.set(withTiming(0, { duration: 200 }));
    };
    // Backgrounding the app pauses the drift; returning restarts it from rest.
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    if (AppState.currentState === 'active' || AppState.currentState === 'unknown') {
      start();
    }
    return () => {
      running = false;
      subscription.remove();
      stop();
    };
  }, [focused, reducedMotion, drift]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.get() }] }));

  const action = onQuickAdd ? (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="Qeyd əlavə et"
      accessibilityHint="Xərc, gəlir, yemək, tapşırıq və ya yuxu əlavə etmək üçün seçimləri açır"
      onPress={onQuickAdd}
      scaleTo={0.98}
      containerStyle={stacked ? styles.actionSlotStacked : styles.actionSlot}
      pressedStyle={{ opacity: 0.9 }}
      style={[styles.action, { backgroundColor: colors.accent }]}
      testID="home-quick-add">
      <AppText variant="bodyStrong" align="center" style={{ color: colors.onAccent }} numberOfLines={1}>
        Qeyd əlavə et
      </AppText>
    </PressableScale>
  ) : null;

  return (
    <View style={[styles.hero, { backgroundColor: colors.heroGradientStart, experimental_backgroundImage: `linear-gradient(160deg, ${colors.heroGradientStart} 0%, ${colors.heroGradientEnd} 100%)`, boxShadow: shadows.hero }]} testID="home-hero">
      {/* The glow: three stacked translucent discs behind the illustration make a soft tonal wash that renders the
          same on every platform (gradients are not guaranteed everywhere). Decorative, so hidden from readers. */}
      {GLOW_DISCS.map((disc) => (
        <View key={disc.size} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" style={[styles.glow, { width: disc.size, height: disc.size, borderRadius: disc.size / 2, right: disc.right, top: disc.top, backgroundColor: colors.heroGlow }]} />
      ))}

      <View style={styles.row}>
        <View style={styles.text}>
          <AppText variant="heading" color="onHero" accessibilityRole="header">
            Gününə bir baxış
          </AppText>
          <AppText variant="meta" color="onHeroMuted" testID="home-hero-line">
            {supportingLine}
          </AppText>
          {stacked ? null : action}
        </View>

        <Animated.View style={[styles.illustrationSlot, stacked ? styles.illustrationSmall : null, floatStyle]} aria-hidden importantForAccessibility="no-hide-descendants">
          <Image source={illustration} style={stacked ? styles.illustrationSmall : styles.illustration} resizeMode="contain" accessible={false} fadeDuration={0} />
        </Animated.View>
      </View>
      {stacked ? action : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 160,
    paddingVertical: Spacing.xl,
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.md,
    borderRadius: 28,
    borderCurve: 'continuous',
    overflow: 'hidden',
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  glow: {
    position: 'absolute',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  actionSlot: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
  actionSlotStacked: {
    alignSelf: 'stretch',
    marginRight: Spacing.sm,
  },
  illustrationSmall: {
    width: 96,
    height: 96,
  },
  action: {
    minHeight: MinTouchTarget - 4,
    paddingHorizontal: Spacing.lg,
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  illustrationSlot: {
    width: ILLUSTRATION,
    height: ILLUSTRATION,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustration: {
    width: ILLUSTRATION,
    height: ILLUSTRATION,
  },
});
