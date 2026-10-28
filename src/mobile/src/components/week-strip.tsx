import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup } from '@/lib/a11y';
import { dateFromIso, formatLongDate, isoDateOf, weekdayShortNames } from '@/lib/dates';

type WeekStripProps = {
  /** The selected calendar date, YYYY-MM-DD. */
  value: string;
  onChange: (isoDate: string) => void;
  /** Today as a calendar date in the profile time zone; also the latest selectable day here. */
  today: string;
  /** Sheet heading when the calendar is opened from the strip. */
  calendarTitle?: string;
  testID?: string;
};

/**
 * The seven days around the selected one: it sits three from the end, so the user can step in both directions
 * without the calendar. The window slides back so that it never runs past today — a future day cannot be
 * chosen anyway — which puts today last whenever the selection is inside the current week.
 */
export function weekWindow(iso: string, today: string): string[] {
  const selected = iso > today ? today : iso;
  const wanted = dateFromIso(selected);
  const lastWanted = isoDateOf(new Date(wanted.getFullYear(), wanted.getMonth(), wanted.getDate() + 3, 12));
  const end = dateFromIso(lastWanted > today ? today : lastWanted);
  return Array.from({ length: 7 }, (_, index) => isoDateOf(new Date(end.getFullYear(), end.getMonth(), end.getDate() - (6 - index), 12)));
}

/** Weekday initial of a calendar date ("B.e."), from the shared Azerbaijani names. */
export function weekdayOf(iso: string): string {
  return weekdayShortNames[dateFromIso(iso).getDay()] ?? '';
}

/**
 * Compact seven-day selector: one row of day cells ending on the selected day, plus the calendar for anything
 * older. Selected and today are separate states (today keeps a ring even when another day is chosen), and days
 * after today are never offered — the diary has no future.
 *
 * No cell claims to know whether a day holds entries: the day endpoint is fetched one day at a time, so a
 * "has entries" dot would be invented rather than read.
 */
export function WeekStrip({ value, onChange, today, calendarTitle = 'Gün seç', testID = 'week-strip' }: WeekStripProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const groupRef = useRef<View>(null);
  const days = weekWindow(value, today);

  useRovingRadioGroup(groupRef, { onSelect: (index) => onChange(days[index] ?? value) });

  return (
    <View style={styles.row} testID={testID}>
      <View ref={groupRef} style={styles.days} accessibilityRole="radiogroup" accessibilityLabel="Gün seç">
        {days.map((iso) => {
          const selected = iso === value;
          const isToday = iso === today;
          const day = dateFromIso(iso).getDate();
          return (
            <PressableScale
              key={iso}
              accessibilityRole="radio"
              aria-checked={selected}
              accessibilityLabel={isToday ? `Bu gün, ${formatLongDate(iso)}` : formatLongDate(iso)}
              tabIndex={selected ? 0 : -1}
              onPress={() => onChange(iso)}
              scaleTo={0.94}
              containerStyle={styles.daySlot}
              pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
              style={[
                styles.day,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : isToday ? colors.primaryText : colors.border,
                  borderWidth: isToday && !selected ? 1.5 : StyleSheet.hairlineWidth,
                },
              ]}
              testID={`week-day-${iso}`}>
              <AppText variant="caption" style={{ color: selected ? colors.onPrimary : colors.textMuted }} numberOfLines={1}>
                {weekdayOf(iso)}
              </AppText>
              <AppText variant="bodyStrong" style={[styles.tabular, { color: selected ? colors.onPrimary : colors.textPrimary }]}>
                {day}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Təqvim"
        accessibilityHint="Başqa günü təqvimdən seçir"
        onPress={() => setOpen(true)}
        scaleTo={0.94}
        pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
        style={[styles.calendarButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="week-strip-calendar">
        <Ionicons name="calendar-outline" size={18} color={colors.textSecondary} />
      </PressableScale>

      <CalendarSheet visible={open} value={value} title={calendarTitle} today={today} maximumDate={dateFromIso(today)} onClose={() => setOpen(false)} onConfirm={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  days: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.xs,
    minWidth: 0,
  },
  daySlot: {
    flex: 1,
    minWidth: 0,
  },
  day: {
    minHeight: MinTouchTarget + 6,
    paddingVertical: Spacing.xs,
    paddingHorizontal: 2,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  calendarButton: {
    width: MinTouchTarget,
    height: MinTouchTarget + 6,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
