import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppText, formatAmount } from '@/components/text';
import { Motion, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLong } from '@/lib/dates';

type SpendingBarsProps = {
  /** Expense per calendar day; index 0 = day 1. */
  dailyExpenses: number[];
  daysElapsed: number;
  currencyCode: string;
  year: number;
  month: number;
  height?: number;
  /** Reference line, e.g. the daily budget pace. */
  referenceValue?: number;
  referenceLabel?: string;
  /** Sweep bars from the baseline on first render. */
  animateOnMount?: boolean;
  compact?: boolean;
};

/**
 * Daily spending for the whole month drawn with plain views. Elapsed days are filled, future days are hollow
 * slots, today is highlighted. Every elapsed day is an accessible element with its date and value.
 */
export function SpendingBars({ dailyExpenses, daysElapsed, currencyCode, year, month, height = 72, referenceValue, referenceLabel, animateOnMount = false, compact = false }: SpendingBarsProps) {
  const { colors } = useTheme();
  const max = Math.max(referenceValue ?? 0, ...dailyExpenses, 1);
  const referenceTop = referenceValue !== undefined ? height - (referenceValue / max) * height : null;
  const elapsed = dailyExpenses.slice(0, daysElapsed);
  const peak = Math.max(...elapsed, 0);
  const summary = `Ayın hər günü üzrə xərc, ${daysElapsed} gün keçib. Ən yüksək gün ${formatAmount(peak, currencyCode)}.`;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.plot, { height }]} accessibilityLabel={summary}>
        {referenceTop !== null ? <View style={[styles.reference, { top: Math.max(0, Math.min(height - 1, referenceTop)), borderColor: colors.warning }]} /> : null}
        <View style={styles.bars}>
          {dailyExpenses.map((amount, index) => (
            <Bar
              key={index}
              ratio={amount / max}
              height={height}
              index={index}
              future={index >= daysElapsed}
              isToday={index === daysElapsed - 1}
              label={index < daysElapsed ? `${formatDayLong(year, month, index + 1)}: ${formatAmount(amount, currencyCode)}` : undefined}
              color={index === daysElapsed - 1 ? colors.primary : colors.expense}
              trackColor={colors.surfaceInteractive}
              futureColor={colors.border}
              animateOnMount={animateOnMount}
            />
          ))}
        </View>
      </View>
      {!compact ? (
        <View style={styles.axis}>
          <AppText variant="caption" color="textMuted">
            1
          </AppText>
          {referenceLabel ? (
            <View style={styles.legend}>
              <View style={[styles.legendLine, { borderColor: colors.warning }]} />
              <AppText variant="caption" color="textMuted">
                {referenceLabel}
              </AppText>
            </View>
          ) : null}
          <AppText variant="caption" color="textMuted">
            {dailyExpenses.length}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

type BarProps = {
  ratio: number;
  height: number;
  index: number;
  future: boolean;
  isToday: boolean;
  label?: string;
  color: string;
  trackColor: string;
  futureColor: string;
  animateOnMount: boolean;
};

function Bar({ ratio, height, index, future, isToday, label, color, trackColor, futureColor, animateOnMount }: BarProps) {
  const { reducedMotion } = useTheme();
  const target = future ? 0 : Math.max(ratio * height, ratio > 0 ? 3 : 0);
  const barHeight = useSharedValue(reducedMotion || !animateOnMount ? target : 0);

  useEffect(() => {
    const animation = withTiming(target, { duration: reducedMotion ? 0 : Motion.data, easing: Motion.easeOut });
    barHeight.set(reducedMotion ? animation : withDelay(Math.min(index, 20) * 10, animation));
  }, [target, index, reducedMotion, barHeight]);

  const fillStyle = useAnimatedStyle(() => ({ height: barHeight.get() }));

  return (
    <View
      accessible={Boolean(label)}
      accessibilityLabel={label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[styles.column, { height, backgroundColor: future ? 'transparent' : trackColor, borderColor: future ? futureColor : 'transparent', borderWidth: future ? StyleSheet.hairlineWidth : 0 }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color, opacity: isToday ? 1 : 0.8 }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.xs,
  },
  plot: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: '100%',
  },
  column: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 3,
  },
  fill: {
    width: '100%',
    borderRadius: 3,
  },
  reference: {
    position: 'absolute',
    pointerEvents: 'none',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    zIndex: 1,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendLine: {
    width: 14,
    borderTopWidth: 1,
    borderStyle: 'dashed',
  },
});
