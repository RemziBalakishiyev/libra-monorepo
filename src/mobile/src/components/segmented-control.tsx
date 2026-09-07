import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SegmentOption<TValue extends string> {
  value: TValue;
  label: string;
  /** Tint of the active pill: default indigo, or the income / expense / transfer semantic colours. */
  tint?: 'primary' | 'expense' | 'income' | 'transfer';
  /** Optional leading icon so the selection reads as a category, not a state. */
  icon?: IconName;
}

type SegmentedControlProps<TValue extends string> = {
  options: readonly SegmentOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
};

/**
 * Equal-width segments with a sliding pill. The pill is a filled tonal surface (never an outlined red frame,
 * which would read as a validation error); the selected label uses the matching `*Text` foreground.
 */
export function SegmentedControl<TValue extends string>({ options, value, onChange, accessibilityLabel, disabled = false, size = 'md' }: SegmentedControlProps<TValue>) {
  const { colors, reducedMotion, shadows } = useTheme();
  const [width, setWidth] = useState(0);
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

  return (
    <View onLayout={onLayout} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.track, { backgroundColor: colors.surfaceSubtle, minHeight: size === 'sm' ? 40 : MinTouchTarget }]}>
      {segmentWidth > 0 ? <Animated.View style={[styles.pill, { width: segmentWidth, backgroundColor: fill, boxShadow: active?.tint ? undefined : shadows.card, opacity: disabled ? 0.5 : 1 }, pillStyle]} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        const color = selected ? strong : colors.textSecondary;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
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
