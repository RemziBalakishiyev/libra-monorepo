import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/date-field';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateFromIso, formatLongDate, isoDateOf, todayIsoDate } from '@/lib/dates';

type DateNavProps = {
  /** Local calendar date, YYYY-MM-DD. */
  value: string;
  onChange: (isoDate: string) => void;
  /** Latest selectable day; the diary blocks future days. */
  maximumDate?: Date;
  title?: string;
};

/** Relative label so the current day is obvious without reading the date: "Bu gün · 7 sentyabr 2026". */
function dayLabel(isoDate: string, now = new Date()): { primary: string; secondary: string } {
  const today = todayIsoDate(now);
  const yesterday = isoDateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const long = formatLongDate(isoDate);
  if (isoDate === today) {
    return { primary: 'Bu gün', secondary: long };
  }
  if (isoDate === yesterday) {
    return { primary: 'Dünən', secondary: long };
  }
  return { primary: long, secondary: '' };
}

/** Previous / next day plus a calendar selector. The centre control opens the month grid. */
export function DateNav({ value, onChange, maximumDate, title = 'Tarix' }: DateNavProps) {
  const { colors, layout } = useTheme();
  const [open, setOpen] = useState(false);
  const label = dayLabel(value);
  const nextDate = new Date(dateFromIso(value).getFullYear(), dateFromIso(value).getMonth(), dateFromIso(value).getDate() + 1, 12);
  const nextDisabled = maximumDate ? nextDate.getTime() > maximumDate.getTime() : false;

  const move = (delta: number) => {
    const current = dateFromIso(value);
    onChange(isoDateOf(new Date(current.getFullYear(), current.getMonth(), current.getDate() + delta)));
  };

  return (
    <View style={styles.row} testID="date-nav">
      <NavButton icon="chevron-back" label="Əvvəlki gün" onPress={() => move(-1)} testID="date-nav-prev" />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label.primary}${label.secondary ? `, ${label.secondary}` : ''}`}
        accessibilityHint="Təqvimi açır"
        onPress={() => setOpen(true)}
        scaleTo={0.99}
        containerStyle={[styles.centerSlot, layout === 'compact' ? null : styles.centerSlotWide]}
        pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
        style={[styles.center, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID="date-nav-calendar">
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <View style={styles.centerText}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {label.primary}
          </AppText>
          {label.secondary ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {label.secondary}
            </AppText>
          ) : null}
        </View>
      </PressableScale>
      <NavButton icon="chevron-forward" label="Növbəti gün" onPress={() => move(1)} disabled={nextDisabled} testID="date-nav-next" />

      <CalendarSheet visible={open} value={value} title={title} maximumDate={maximumDate} onClose={() => setOpen(false)} onChange={onChange} />
    </View>
  );
}

function NavButton({ icon, label, onPress, disabled = false, testID }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void; disabled?: boolean; testID: string }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
      style={[styles.navButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
      testID={testID}>
      <Ionicons name={icon} size={18} color={disabled ? colors.textDisabled : colors.textPrimary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  navButton: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerSlot: {
    flex: 1,
    minWidth: 0,
  },
  centerSlotWide: {
    // The control stays a control on desktop instead of stretching across the column.
    maxWidth: 320,
  },
  center: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  centerText: {
    alignItems: 'center',
  },
});
