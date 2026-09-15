import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldMessage } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup, webAria } from '@/lib/a11y';
import { dateFromIso, daysInMonth, formatLongDate, isoDateOf, monthNames, todayIsoDate, weekdayShortNames } from '@/lib/dates';

type DateFieldProps = {
  label?: string;
  /** Local calendar date, YYYY-MM-DD. */
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
  disabled?: boolean;
  maximumDate?: Date;
};

/**
 * Localised date field ("6 sentyabr 2026"). iOS shows the inline system picker in a sheet, Android opens the
 * system dialog, and web (or any platform without the native picker) uses the accessible calendar sheet.
 */
export function DateField({ label = 'Tarix', value, onChange, error, disabled = false, maximumDate }: DateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const date = dateFromIso(value);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        maximumDate,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            onChange(isoDateOf(selected));
          }
        },
      });
      return;
    }
    setOpen(true);
  };

  return (
    <View style={styles.container}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatLongDate(value)}`}
        accessibilityHint={error ?? 'Tarix seçicisini açır'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={openPicker}
        scaleTo={0.99}
        containerStyle={styles.full}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <AppText style={styles.flex}>{formatLongDate(value)}</AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </PressableScale>
      <FieldMessage error={error} />

      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label} scrollable={false} footer={<Button title="Hazırdır" onPress={() => setOpen(false)} style={styles.flex} />}>
          <DateTimePicker
            value={date}
            mode="date"
            display="inline"
            maximumDate={maximumDate}
            accentColor={colors.primary}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) {
                onChange(isoDateOf(selected));
              }
            }}
          />
        </Sheet>
      ) : Platform.OS !== 'android' ? (
        <CalendarSheet visible={open} value={value} onClose={() => setOpen(false)} onChange={onChange} title={label} maximumDate={maximumDate} />
      ) : null}
    </View>
  );
}

type CalendarSheetProps = {
  visible: boolean;
  value: string;
  onClose: () => void;
  onChange: (isoDate: string) => void;
  title: string;
  maximumDate?: Date;
};

/**
 * Accessible month calendar (web fallback). Weeks start on Monday and days are 44 pt targets.
 *
 * It renders as one labelled radio group of days rather than an ARIA grid: the days are a set of mutually
 * exclusive choices, and React Native's `accessibilityRole` union has no `grid` / `row` / `gridcell`, so a grid
 * would exist on the web only. Three states stay distinct — the chosen day carries `aria-checked`, today carries
 * `aria-current="date"` and an outline, and focus is the roving tab stop the arrow keys move (±1 day
 * horizontally, ±1 week vertically).
 *
 * Arrow keys move a *pending* day: the checked radio follows focus while the field behind the sheet is
 * untouched. Space and Enter commit that day and close; Escape discards it and reopening restores the committed
 * date and its month. Days after `maximumDate` are disabled, unfocusable and skipped.
 */
export function CalendarSheet({ visible, value, onClose, onChange, title, maximumDate }: CalendarSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scrollable={false} maxWidth={400}>
      {/* Mounted only while open, so the pending day and the shown month both start from the committed date. */}
      {visible ? <CalendarBody value={value} onClose={onClose} onChange={onChange} title={title} maximumDate={maximumDate} /> : null}
    </Sheet>
  );
}

function CalendarBody({ value, onClose, onChange, title, maximumDate }: Omit<CalendarSheetProps, 'visible'>) {
  const { colors } = useTheme();
  const gridRef = useRef<View>(null);
  const committed = dateFromIso(value);
  /** The day the dialog is showing as chosen. It becomes the field's value only on commit. */
  const [pending, setPending] = useState(value);
  const [cursor, setCursor] = useState({ year: committed.getFullYear(), month: committed.getMonth() + 1 });
  const today = todayIsoDate();
  const total = daysInMonth(cursor.year, cursor.month);
  const firstWeekday = (new Date(cursor.year, cursor.month - 1, 1).getDay() + 6) % 7; // Monday = 0
  // Built in one pass (no mutation) so the memoized callbacks below can depend on it.
  const trailing = (7 - ((firstWeekday + total) % 7)) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, index) => index + 1),
    ...Array.from({ length: trailing }, () => null),
  ];
  const weekdays = [...weekdayShortNames.slice(1), weekdayShortNames[0]];

  const move = (delta: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  const isoOf = (day: number) => `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const isBlocked = (iso: string) => (maximumDate ? dateFromIso(iso).getTime() > maximumDate.getTime() : false);
  // Enabled day cells in DOM order; the keyboard walks this list, so blocked future days are skipped.
  const selectableDays = cells.filter((day): day is number => day !== null && !isBlocked(isoOf(day)));

  // The hook reads these through a ref, so they need no memoization.
  const moveTo = (position: number) => {
    const day = selectableDays[position];
    if (day !== undefined) {
      setPending(isoOf(day));
    }
  };
  const commitAt = (position: number) => {
    const day = selectableDays[position];
    if (day !== undefined) {
      onChange(isoOf(day));
      onClose();
    }
  };
  // Seven columns: ArrowUp / ArrowDown move a whole week, Home / End jump to the ends of the week.
  useRovingRadioGroup(gridRef, { onSelect: moveTo, onActivate: commitAt, columns: 7 });

  /** The single tab stop: the pending day when it is in view, otherwise today, otherwise the first open day. */
  const focusIso = (() => {
    if (selectableDays.some((day) => isoOf(day) === pending)) {
      return pending;
    }
    const todayDay = selectableDays.find((day) => isoOf(day) === today);
    return todayDay !== undefined ? isoOf(todayDay) : selectableDays.length > 0 ? isoOf(selectableDays[0]!) : null;
  })();

  return (
    <>
      <View style={styles.calendarHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="Əvvəlki ay" onPress={() => move(-1)} style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="subheading" accessibilityLiveRegion="polite">
          {monthNames[cursor.month - 1]} {cursor.year}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Növbəti ay" onPress={() => move(1)} style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {weekdays.map((day) => (
          <AppText key={day} variant="caption" color="textMuted" align="center" style={styles.cell}>
            {day}
          </AppText>
        ))}
      </View>
      <View ref={gridRef} style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={title} testID="calendar-grid">
        {cells.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.cell} />;
          }
          const iso = isoOf(day);
          const isSelected = iso === pending;
          const isToday = iso === today;
          const disabled = isBlocked(iso);
          return (
            <Pressable
              key={iso}
              accessibilityRole="radio"
              accessibilityLabel={isToday ? `${formatLongDate(iso)}, bu gün` : formatLongDate(iso)}
              aria-checked={isSelected}
              aria-disabled={disabled}
              {...webAria(isToday ? { 'aria-current': 'date' } : {})}
              disabled={disabled}
              tabIndex={iso === focusIso ? 0 : -1}
              onPress={() => {
                onChange(iso);
                onClose();
              }}
              style={({ pressed }) => [
                styles.cell,
                styles.day,
                { backgroundColor: isSelected ? colors.primary : pressed ? colors.surfaceSubtle : 'transparent', borderColor: isToday && !isSelected ? colors.primary : 'transparent', opacity: disabled ? 0.35 : 1 },
              ]}>
              <AppText variant="meta" style={{ color: isSelected ? colors.onPrimary : colors.textPrimary }}>
                {day}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  full: {
    width: '100%',
  },
  flex: {
    flex: 1,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.xs,
  },
  cell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
