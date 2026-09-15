import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type PressableScaleProps = Omit<PressableProps, 'style' | 'children'> & {
  children: ReactNode;
  /** Visual style of the animated inner view (background, padding, radius). */
  style?: StyleProp<ViewStyle>;
  /** Layout style of the pressable itself (flex, width) so the touch target fills its slot in a row. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Scale on press-in (default 0.97). Reduced motion falls back to an opacity dip. */
  scaleTo?: number;
  pressedStyle?: StyleProp<ViewStyle>;
  /** Fade the control while disabled (default). Off for states that are inactive but must stay readable (success). */
  dimWhenDisabled?: boolean;
};

/**
 * Press feedback on the UI thread: feedback starts on press-in, the action commits on press-out.
 * ~110 ms and 3% scale is the ceiling for something touched tens of times a day.
 */
export const PressableScale = forwardRef<View, PressableScaleProps>(function PressableScale(
  { children, style, containerStyle, scaleTo = Motion.pressScale, pressedStyle, disabled, dimWhenDisabled = true, ...rest },
  ref,
) {
  const { reducedMotion } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const progress = pressed.get();
    if (reducedMotion) {
      return { opacity: 1 - progress * 0.25 };
    }
    return { transform: [{ scale: 1 - progress * (1 - scaleTo) }] };
  });

  return (
    <Pressable
      ref={ref}
      disabled={disabled}
      hitSlop={4}
      pressRetentionOffset={16}
      onPressIn={() => pressed.set(withTiming(1, { duration: Motion.press, easing: Motion.easeOut }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: Motion.quick, easing: Motion.easeOut }))}
      style={containerStyle}
      {...rest}>
      {({ pressed: isPressed }) => (
        <Animated.View style={[style, animatedStyle, isPressed ? pressedStyle : null, disabled && dimWhenDisabled ? { opacity: 0.45 } : null]}>{children}</Animated.View>
      )}
    </Pressable>
  );
});
