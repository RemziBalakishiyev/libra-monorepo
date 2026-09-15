import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { SleepDay } from '@/lib/api/sleep';
import { describeDay, formatDuration, peakMinutes, weekdayLabel } from '@/lib/sleep';

/**
 * Seven local dates, tallest bar to scale. A date with nothing recorded shows a hollow slot and reads as
 * "Qeyd yoxdur" — never a zero-height bar, which would claim the user slept no minutes at all.
 */
export function SleepStrip({ days }: { days: readonly SleepDay[] }) {
  const { colors } = useTheme();
  const peak = peakMinutes(days);

  return (
    <View style={styles.strip} accessibilityRole="summary" testID="sleep-strip">
      {days.map((day) => {
        const recorded = day.totalMinutes !== null;
        const height = recorded ? Math.max(6, Math.round((day.totalMinutes! / peak) * 72)) : 6;
        return (
          <View key={day.date} style={styles.column} accessible accessibilityLabel={describeDay(day)} testID={`sleep-day-${day.date}`}>
            <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.value}>
              {recorded ? formatDuration(day.totalMinutes!) : '—'}
            </AppText>
            <View style={styles.track}>
              <View
                style={[
                  styles.bar,
                  { height, backgroundColor: recorded ? colors.moduleSleep : 'transparent', borderColor: colors.border, borderWidth: recorded ? 0 : 1 },
                ]}
              />
            </View>
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {weekdayLabel(day.date)}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xxs,
    minWidth: 0,
  },
  value: {
    fontSize: 10,
  },
  track: {
    height: 72,
    justifyContent: 'flex-end',
    width: '100%',
    alignItems: 'center',
  },
  bar: {
    width: '70%',
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
  },
});
