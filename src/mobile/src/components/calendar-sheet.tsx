import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useRovingRadioGroup, webAria } from '@/lib/a11y';
import { dateFromIso, daysInMonth, formatLongDate, isoDateOf, monthNames, todayInProfileZone, weekdayShortNames } from '@/lib/dates';

export type CalendarSheetProps = {
  visible: boolean;
  /** The committed calendar date, YYYY-MM-DD. */
  value: string;
  /** Called once when "Təsdiqlə" is pressed with a permitted pending date; the sheet then closes itself. */
  onConfirm: (isoDate: string) => void;
  /** Close control, backdrop, Escape, Android Back or swipe: the pending date is discarded. */
  onClose: () => void;
  title?: string;
  /** Earliest / latest selectable calendar days, from the owning field's own policy. Absent means open. */
  minimumDate?: Date;
  maximumDate?: Date;
  /** Today as a calendar date; defaults to today in the profile time zone. */
  today?: string;
  testID?: string;
};

/** Monday-first weekday labels: `weekdayShortNames` starts on Sunday. */
const WEEKDAYS = [...weekdayShortNames.slice(1), weekdayShortNames[0]!];

export function isoOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Previous calendar day of a YYYY-MM-DD, as a calendar date (no instants involved). */
export function previousDay(iso: string): string {
  const date = dateFromIso(iso);
  return isoDateOf(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12));
}

/**
 * Whether a calendar day is within the field's policy. Bounds are `Date`s from the owning form; only their local
 * calendar day counts, so a maximum of "today 23:59" and one of "today 00:00" both permit today.
 */
export function isPermitted(iso: string, minimumDate?: Date, maximumDate?: Date): boolean {
  if (minimumDate && iso < isoDateOf(minimumDate)) {
    return false;
  }
  if (maximumDate && iso > isoDateOf(maximumDate)) {
    return false;
  }
  return true;
}

/** The month grid: leading blanks from Monday, every day, then trailing blanks to a full week. */
export function monthCells(year: number, month: number): (number | null)[] {
  const total = daysInMonth(year, month);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0
  const trailing = (7 - ((firstWeekday + total) % 7)) % 7;
  return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: total }, (_, index) => index + 1), ...Array.from({ length: trailing }, () => null)];
}

/**
 * The shared date-only calendar: one sheet on every platform (iOS, Android, web) so the behaviour and the
 * evidence are the same everywhere.
 *
 * Choosing a day, a shortcut or a keyboard move changes only the *pending* date; "Təsdiqlə" commits it once and
 * closes. Every other way out — the close control, the backdrop, Escape, Android Back, a swipe — discards the
 * pending date, and because the body mounts only while open, reopening starts again from the committed value
 * and its month. Month navigation never touches the owning form.
 *
 * Accessibility: the days are one labelled radio group (React Native has no grid roles), the chosen day carries
 * `aria-checked`, today carries `aria-current="date"` and its own ring, blocked days are `aria-disabled` and
 * unfocusable. Arrow keys move the pending day (±1 horizontally, ±7 vertically), Home/End jump within the week,
 * Enter or Space on a day selects it, and the footer button commits. Focus returns to the trigger on close.
 */
export function CalendarSheet({ visible, value, onConfirm, onClose, title = 'Tarix seç', minimumDate, maximumDate, today, testID = 'calendar-sheet' }: CalendarSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} scrollable={false} maxWidth={420} accessibilityLabel={title} testID={testID}>
      {visible ? <CalendarBody value={value} onConfirm={onConfirm} onClose={onClose} title={title} minimumDate={minimumDate} maximumDate={maximumDate} today={today} /> : null}
    </Sheet>
  );
}

type BodyProps = Omit<CalendarSheetProps, 'visible' | 'testID'>;

function CalendarBody({ value, onConfirm, onClose, title, minimumDate, maximumDate, today: todayProp }: BodyProps) {
  const { colors } = useTheme();
  const gridRef = useRef<View>(null);
  const today = todayProp ?? todayInProfileZone();
  const committed = dateFromIso(value);
  /** The day shown as chosen. It becomes the field's value only through "Təsdiqlə". */
  const [pending, setPending] = useState(value);
  const [cursor, setCursor] = useState({ year: committed.getFullYear(), month: committed.getMonth() + 1 });
  const cells = monthCells(cursor.year, cursor.month);
  const permitted = (iso: string) => isPermitted(iso, minimumDate, maximumDate);
  const yesterday = previousDay(today);
  const shortcuts = [
    { key: 'today', label: 'Bu gün', iso: today },
    { key: 'yesterday', label: 'Dünən', iso: yesterday },
  ].filter((shortcut) => permitted(shortcut.iso));

  const moveMonth = (delta: number) => {
    const next = new Date(cursor.year, cursor.month - 1 + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 });
  };

  /** Selecting a shortcut also brings its month into view, so the checked day is never off-screen. */
  const choose = (iso: string) => {
    setPending(iso);
    const date = dateFromIso(iso);
    setCursor({ year: date.getFullYear(), month: date.getMonth() + 1 });
  };

  const dayIso = (day: number) => isoOf(cursor.year, cursor.month, day);
  // Enabled day cells in DOM order; the keyboard walks this list, so blocked days are skipped.
  const selectableDays = cells.filter((day): day is number => day !== null && permitted(dayIso(day)));
  const selectAt = (position: number) => {
    const day = selectableDays[position];
    if (day !== undefined) {
      setPending(dayIso(day));
    }
  };
  useRovingRadioGroup(gridRef, { onSelect: selectAt, onActivate: selectAt, columns: 7 });

  /** The single tab stop: the pending day when it is in view, otherwise today, otherwise the first open day. */
  const focusIso = (() => {
    if (selectableDays.some((day) => dayIso(day) === pending)) {
      return pending;
    }
    const todayDay = selectableDays.find((day) => dayIso(day) === today);
    return todayDay !== undefined ? dayIso(todayDay) : selectableDays.length > 0 ? dayIso(selectableDays[0]!) : null;
  })();

  const canConfirm = permitted(pending);
  const confirm = () => {
    if (!canConfirm) {
      return;
    }
    onConfirm(pending);
    onClose();
  };

  return (
    <View style={styles.body}>
      <View style={styles.monthRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Əvvəlki ay" onPress={() => moveMonth(-1)} hitSlop={4} style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]} testID="calendar-prev">
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </Pressable>
        <AppText variant="subheading" accessibilityLiveRegion="polite" accessibilityRole="header" testID="calendar-month">
          {monthNames[cursor.month - 1]} {cursor.year}
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Növbəti ay" onPress={() => moveMonth(1)} hitSlop={4} style={({ pressed }) => [styles.navButton, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surfaceSubtle }]} testID="calendar-next">
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.weekRow} aria-hidden importantForAccessibility="no-hide-descendants" testID="calendar-weekdays">
        {WEEKDAYS.map((day) => (
          <AppText key={day} variant="caption" color="textMuted" align="center" style={styles.cell}>
            {day}
          </AppText>
        ))}
      </View>

      {/* Only the grid scrolls on a short screen or with enlarged text; the month, shortcuts and footer stay put. */}
      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.gridContent} keyboardShouldPersistTaps="handled" bounces={false}>
        <View ref={gridRef} style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel={title} testID="calendar-grid">
          {cells.map((day, index) => {
            if (day === null) {
              return <View key={`empty-${index}`} style={styles.cell} />;
            }
            const iso = dayIso(day);
            const isSelected = iso === pending;
            const isToday = iso === today;
            const disabled = !permitted(iso);
            const spoken = `${formatLongDate(iso)}${isToday ? ', bu gün' : ''}${disabled ? ', seçilə bilməz' : ''}`;
            return (
              <Pressable
                key={iso}
                accessibilityRole="radio"
                accessibilityLabel={spoken}
                aria-checked={isSelected}
                aria-disabled={disabled}
                {...webAria(isToday ? { 'aria-current': 'date' } : {})}
                disabled={disabled}
                tabIndex={iso === focusIso ? 0 : -1}
                onPress={() => setPending(iso)}
                style={styles.cell}
                testID={`calendar-day-${iso}`}>
                {({ pressed }) => (
                  <View style={[styles.day, { backgroundColor: isSelected ? colors.primary : pressed ? colors.surfaceSubtle : 'transparent', borderColor: isToday && !isSelected ? colors.primary : 'transparent' }]}>
                    <AppText variant="meta" style={[{ color: isSelected ? colors.onPrimary : disabled ? colors.textDisabled : colors.textPrimary }, disabled ? styles.struck : null]}>
                      {day}
                    </AppText>
                    {isToday && !isSelected ? <View style={[styles.todayDot, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footerBlock}>
        {shortcuts.length > 0 ? (
          <View style={styles.shortcuts}>
            {shortcuts.map((shortcut) => {
              const active = shortcut.iso === pending;
              return (
                <PressableScale
                  key={shortcut.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${shortcut.label}, ${formatLongDate(shortcut.iso)}`}
                  aria-pressed={active}
                  onPress={() => choose(shortcut.iso)}
                  scaleTo={0.96}
                  pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
                  style={[styles.shortcut, { backgroundColor: active ? colors.primarySoft : colors.surfaceSubtle, borderColor: active ? colors.primary : 'transparent' }]}
                  testID={`calendar-${shortcut.key}`}>
                  <AppText variant="meta" color={active ? 'primaryText' : 'textSecondary'}>
                    {shortcut.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
        ) : null}
        <View style={styles.summary} accessibilityLiveRegion="polite">
          <AppText variant="caption" color="textMuted">
            Seçilib
          </AppText>
          <AppText variant="bodyStrong" testID="calendar-summary">
            {formatLongDate(pending)}
            {pending === today ? ' · bu gün' : ''}
          </AppText>
        </View>
        <Button title="Təsdiqlə" onPress={confirm} disabled={!canConfirm} accessibilityHint={canConfirm ? `${formatLongDate(pending)} tarixini seçir` : 'Bu tarix seçilə bilməz'} testID="calendar-confirm" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flexShrink: 1,
    gap: Spacing.sm,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xs,
  },
  navButton: {
    width: MinTouchTarget - 4,
    height: MinTouchTarget - 4,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  gridScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  gridContent: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    minHeight: MinTouchTarget - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  footerBlock: {
    gap: Spacing.md,
    paddingTop: Spacing.xs,
  },
  shortcuts: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  shortcut: {
    minHeight: MinTouchTarget - 8,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  summary: {
    gap: 1,
  },
});
