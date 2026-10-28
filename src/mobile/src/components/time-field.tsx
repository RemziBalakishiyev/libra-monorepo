import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { FieldMessage } from '@/components/form-field';
import { PressableScale } from '@/components/pressable-scale';
import { Sheet } from '@/components/sheet';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TimeFieldProps = {
  label?: string;
  /** 24-hour local time, HH:MM. */
  value: string;
  onChange: (time: string) => void;
  error?: string;
  disabled?: boolean;
};

/** Keeps digits and one colon: "0930" becomes "09:30" while typing, and paste still works. */
export function sanitizeTime(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function toDate(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours! : 12, Number.isFinite(minutes) ? minutes! : 0, 0, 0);
  return date;
}

export function formatTimeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Time of a meal. iOS opens the inline system picker in a sheet, Android the system dialog, and every other
 * platform (web included) types straight into the field with a digit mask.
 */
export function TimeField({ label = 'Saat', value, onChange, error, disabled = false }: TimeFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const native = Platform.OS === 'ios' || Platform.OS === 'android';

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: toDate(value),
        mode: 'time',
        is24Hour: true,
        onChange: (event: DateTimePickerEvent, selected?: Date) => {
          if (event.type === 'set' && selected) {
            onChange(formatTimeOf(selected));
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
      {native ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value}`}
          accessibilityHint={error ?? 'Saat seçicisini açır'}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={openPicker}
          scaleTo={0.99}
          containerStyle={styles.full}
          style={[styles.field, { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}>
          <Ionicons name="time-outline" size={18} color={colors.textMuted} />
          <AppText style={styles.flex}>{value}</AppText>
          <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
        </PressableScale>
      ) : (
        <View style={[styles.field, { backgroundColor: disabled ? colors.surfaceSubtle : colors.surface, borderColor: error ? colors.error : focused ? colors.primary : colors.border, borderWidth: focused ? 1.5 : 1 }]}>
          <Ionicons name="time-outline" size={18} color={focused ? colors.primary : colors.textMuted} />
          <TextInput
            accessibilityLabel={label}
            accessibilityHint={error}
            value={value}
            onChangeText={(text) => onChange(sanitizeTime(text))}
            editable={!disabled}
            keyboardType="number-pad"
            inputMode="numeric"
            placeholder="09:30"
            placeholderTextColor={colors.textPlaceholder}
            maxLength={5}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, { color: colors.textPrimary }]}
          />
        </View>
      )}
      <FieldMessage error={error} />

      {Platform.OS === 'ios' ? (
        <Sheet visible={open} onClose={() => setOpen(false)} title={label} scrollable={false} footer={<Button title="Hazırdır" onPress={() => setOpen(false)} style={styles.flex} />}>
          <DateTimePicker
            value={toDate(value)}
            mode="time"
            display="spinner"
            is24Hour
            accentColor={colors.primary}
            onChange={(_event: DateTimePickerEvent, selected?: Date) => {
              if (selected) {
                onChange(formatTimeOf(selected));
              }
            }}
          />
        </Sheet>
      ) : null}
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
  input: {
    flex: 1,
    // Same as the shared text field: the web <input>'s intrinsic width would overrun this half-width column.
    minWidth: 0,
    ...Type.body,
    fontSize: 16,
    paddingVertical: Spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
