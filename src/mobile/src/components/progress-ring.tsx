import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ProgressRingProps = {
  /** Share of the target already drawn, 0–100. Callers clamp it; the exact figure lives beside the ring. */
  percent: number;
  size?: number;
  thickness?: number;
  color: string;
  trackColor?: string;
  /** Colour of the centre disc. Defaults to `surface`; a ring on a dark scene passes that scene's colour. */
  surfaceColor?: string;
  /** Draws a small luminous dot at the leading edge of the arc, for a ring that is actively moving. */
  endpoint?: boolean;
  /** Rendered in the middle (a short percentage, or a dash when there is no target). */
  children?: React.ReactNode;
  /** One sentence for assistive technology: the ring itself is never read as a number of frames. */
  accessibilityLabel?: string;
  testID?: string;
};

const HALF_TURN = 180;
const FULL_TURN = 360;

/** The angle each half-disc is rotated to so that the arc covers `degrees` of sweep from twelve o'clock. */
export function halfAngles(degrees: number): { right: number; left: number } {
  'worklet';
  // Each disc covers 180° of the circle and is rotated backwards until only the swept part shows inside its
  // own clip: the right half draws the first 180°, the left half the rest.
  return {
    right: Math.min(HALF_TURN, Math.max(0, degrees)) - HALF_TURN,
    left: Math.min(FULL_TURN, Math.max(HALF_TURN, degrees)) - FULL_TURN,
  };
}

/**
 * A ring drawn with views, because the app has no SVG dependency: two half-discs rotate inside half-width clips,
 * which is the standard CSS-less way to draw an arc in React Native.
 *
 * The right half sweeps 0–180°, then the left half takes over for 180–360°. Both rotations run on the UI thread
 * and only when the value actually changes; reduced motion jumps straight to the final angle. The ring is
 * decorative — the accessible name states the real figures, so nothing announces intermediate frames.
 */
export function ProgressRing({ percent, size = 74, thickness = 7, color, trackColor, surfaceColor, endpoint = false, children, accessibilityLabel, testID }: ProgressRingProps) {
  const { colors, reducedMotion } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const progress = useSharedValue(clamped);

  useEffect(() => {
    progress.set(reducedMotion ? clamped : withTiming(clamped, { duration: Motion.data, easing: Motion.easeOut }));
  }, [clamped, reducedMotion, progress]);

  // 0–50 % turns the right half; 50–100 % holds it at its full half and turns the left half.
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${halfAngles((progress.get() / 100) * FULL_TURN).right}deg` }] }));
  const leftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${halfAngles((progress.get() / 100) * FULL_TURN).left}deg` }] }));
  // The endpoint rides the arc: rotating a full-size layer by the swept angle carries a dot pinned at twelve
  // o'clock round to wherever the arc currently ends. It fades in only once there is an arc to end.
  const endpointStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, progress.get() / 2),
    transform: [{ rotate: `${(progress.get() / 100) * FULL_TURN}deg` }],
  }));

  const half = size / 2;
  const inner = size - thickness * 2;
  const track = trackColor ?? colors.surfaceInteractive;

  return (
    <View
      style={[styles.root, { width: size, height: size, borderRadius: half }]}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      testID={testID}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: half, backgroundColor: track }]} />

      {/* Left half of the arc: revealed only past the halfway mark. */}
      <View style={[styles.halfClip, { width: half, height: size, left: 0 }]}>
        <Animated.View style={[styles.halfDisc, { width: half, height: size, borderTopLeftRadius: half, borderBottomLeftRadius: half, backgroundColor: color, transformOrigin: 'right center' }, leftStyle]} />
      </View>

      {/* Right half: sweeps first, out of sight inside its own clip until the arc reaches it. */}
      <View style={[styles.halfClip, { width: half, height: size, left: half }]}>
        <Animated.View style={[styles.halfDisc, { width: half, height: size, borderTopRightRadius: half, borderBottomRightRadius: half, backgroundColor: color, transformOrigin: 'left center' }, rightStyle]} />
      </View>

      {endpoint ? (
        <Animated.View style={[StyleSheet.absoluteFill, endpointStyle]} pointerEvents="none">
          <View style={[styles.endpoint, { width: thickness + 3, height: thickness + 3, borderRadius: (thickness + 3) / 2, backgroundColor: color, marginTop: -1.5, marginLeft: -(thickness + 3) / 2 }]} />
        </Animated.View>
      ) : null}

      <View style={[styles.center, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: surfaceColor ?? colors.surface }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  halfClip: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
  },
  halfDisc: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  endpoint: {
    position: 'absolute',
    left: '50%',
    top: 0,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
