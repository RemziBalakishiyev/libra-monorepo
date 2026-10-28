import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';

import { CalendarSheet } from '@/components/calendar-sheet';
import { FieldMessage } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatLongDate } from '@/lib/dates';

export { CalendarSheet } from '@/components/calendar-sheet';

type DateFieldProps = {
  label?: string;
  /** Local calendar date, YYYY-MM-DD. */
  value: string;
  onChange: (isoDate: string) => void;
  error?: string;
  disabled?: boolean;
  /** The caller's own policy; nothing is imposed globally. */
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
};

/**
 * Localised date-only field ("18 sentyabr 2026") that opens the shared calendar sheet on every platform.
 *
 * The keyboard is dismissed before the sheet opens. A React Native `Modal` does not resign the focused input,
 * so without this the bottom sheet is laid out under a keyboard that is still up and its lower half — the last
 * weeks of the month and the confirmation — is hidden behind it. Dismissing first also lets the form's keyboard
 * avoidance settle, so nothing behind the sheet keeps a stale keyboard height.
 */
export function DateField({ label = 'Tarix', value, onChange, error, disabled = false, minimumDate, maximumDate, testID }: DateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const openPicker = () => {
    Keyboard.dismiss();
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
        accessibilityHint={error ?? 'Təqvimi açır'}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={openPicker}
        scaleTo={0.99}
        containerStyle={styles.full}
        style={[styles.field, { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}
        testID={testID}>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
        <AppText style={styles.flex}>{formatLongDate(value)}</AppText>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </PressableScale>
      <FieldMessage error={error} />

      <CalendarSheet visible={open} value={value} onConfirm={onChange} onClose={() => setOpen(false)} minimumDate={minimumDate} maximumDate={maximumDate} />
    </View>
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
});
