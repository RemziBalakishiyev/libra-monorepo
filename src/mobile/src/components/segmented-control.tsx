import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup, webAria } from '@/lib/a11y';

export interface SegmentOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Tint of the active pill: default indigo, or the income / expense / transfer semantic colours. */
  tint?: 'primary' | 'expense' | 'income' | 'transfer';
  /** Optional leading icon so the selection reads as a category, not a state. */
  icon?: IconName;
  /** Spoken name when the visible label is abbreviated to fit. */
  accessibilityLabel?: string;
}

type SegmentedControlProps<TValue extends string> = {
  options: readonly SegmentOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Distinguishes several groups on one screen (tests and the accessibility run query it). */
  testID?: string;
};

/**
 * Equal-width segments with a sliding pill. The pill is a filled tonal surface (never an outlined red frame,
 * which would read as a validation error); the selected label uses the matching `*Text` foreground.
 */
export function SegmentedControl<TValue extends string>({ options, value, onChange, accessibilityLabel, disabled = false, size = 'md', testID = 'segmented-control' }: SegmentedControlProps<TValue>) {
  const { colors, reducedMotion, shadows } = useTheme();
  const [width, setWidth] = useState(0);
  const groupRef = useRef<View>(null);
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const segmentWidth = width > 0 ? (width - PADDING * 2) / options.length : 0;
  const x = useSharedValue(0);
  const active = options[index];
  const fill = active?.tint === 'expense' ? colors.expenseSoft : active?.tint === 'income' ? colors.incomeSoft : active?.tint === 'transfer' ? colors.transferSoft : colors.surface;
  const strong = active?.tint === 'expense' ? colors.expenseText : active?.tint === 'income' ? colors.incomeText : active?.tint === 'transfer' ? colors.transferText : colors.primaryText;

  useEffect(() => {
    const target = index * segmentWidth;
    x.set(reducedMotion ? target : withTiming(target, { duration: Motion.move, easing: Motion.easeInOut }));
  }, [index, segmentWidth, reducedMotion, x]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  // Arrow keys move focus and the selection together, and Space checks the focused segment.
  // The group is enabled or disabled as a whole, so DOM order matches the option order.
  const selectByIndex = useCallback(
    (position: number) => {
      const option = options[position];
      if (option) {
        onChange(option.value);
      }
    },
    [options, onChange],
  );
  useRovingRadioGroup(groupRef, { onSelect: selectByIndex, enabled: !disabled });

  return (
    <View
      ref={groupRef}
      onLayout={onLayout}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      {...webAria({ 'aria-orientation': 'horizontal' })}
      style={[styles.track, { backgroundColor: colors.surfaceSubtle, minHeight: size === 'sm' ? 40 : MinTouchTarget }]}>
      {segmentWidth > 0 ? <Animated.View style={[styles.pill, { width: segmentWidth, backgroundColor: fill, boxShadow: active?.tint ? undefined : shadows.card, opacity: disabled ? 0.5 : 1 }, pillStyle]} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        const color = selected ? strong : colors.textSecondary;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            // `aria-checked` carries the state on both platforms: react-native-web ignores accessibilityState,
            // and React Native merges the aria prop back into it (see lib/a11y.ts).
            aria-checked={selected}
            aria-disabled={disabled}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            disabled={disabled}
            // Roving tab stop: the group is entered once, then arrow keys move within it.
            tabIndex={selected ? 0 : -1}
            onPress={() => onChange(option.value)}
            style={styles.segment}>
            {option.icon ? <Ionicons name={option.icon} size={size === 'sm' ? 14 : 16} color={color} /> : null}
            <AppText variant={size === 'sm' ? 'meta' : 'bodyStrong'} style={{ color }} numberOfLines={1}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const PADDING = 3;

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: PADDING,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    pointerEvents: 'none',
    top: PADDING,
    bottom: PADDING,
    left: PADDING,
    borderRadius: Radius.md - 3,
    borderCurve: 'continuous',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
});
