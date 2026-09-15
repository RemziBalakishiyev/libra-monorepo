import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Validation or hint under a field. Renders nothing when there is nothing to say, so forms stay tight; an error
 * grows the field naturally and is announced as an alert.
 */
export function FieldMessage({ error, hint, id }: { error?: string; hint?: string; id?: string }) {
  if (!error && !hint) {
    return null;
  }
  return (
    <View style={styles.message} nativeID={id}>
      {error ? (
        <AppText variant="caption" color="error" accessibilityRole="alert" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      )}
    </View>
  );
}

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
  hint?: string;
  icon?: IconName;
  /** Adds a show/hide control for passwords. */
  secureToggle?: boolean;
  trailing?: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Labelled input on a white surface with a primary focus ring and an inline validation slot.
 *
 * The ref reaches the inner `TextInput`, so a form that reveals its first invalid field can also focus it.
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, icon, secureToggle = false, trailing, editable = true, style, containerStyle, secureTextEntry, onFocus, onBlur, ...inputProps },
  ref,
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const secure = secureToggle ? !revealed : Boolean(secureTextEntry);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;

  return (
    <View style={[styles.container, containerStyle]}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <View style={[styles.inputRow, { backgroundColor: editable ? colors.surface : colors.surfaceSubtle, borderColor, borderWidth: focused ? 1.5 : 1 }]}>
        {icon ? <Ionicons name={icon} size={18} color={focused ? colors.primary : colors.textMuted} /> : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error}
          accessibilityState={{ disabled: !editable }}
          editable={editable}
          secureTextEntry={secure}
          placeholderTextColor={colors.textPlaceholder}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: editable ? colors.textPrimary : colors.textSecondary }, style]}
          {...inputProps}
        />
        {secureToggle ? (
          <Pressable accessibilityRole="button" accessibilityLabel={revealed ? 'Şifrəni gizlət' : 'Şifrəni göstər'} onPress={() => setRevealed((value) => !value)} hitSlop={8} style={styles.trailingButton}>
            <Ionicons name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
          </Pressable>
        ) : (
          trailing
        )}
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
});

type SelectRowProps = {
  label: string;
  value: string | undefined;
  placeholder: string;
  onPress: () => void;
  icon?: IconName;
  iconColor?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** Explains why the field is locked (e.g. currency after activity). */
  lockedReason?: string;
  /** Compact chip for filter bars: "Label: value" on one line, no separate label above. */
  compact?: boolean;
  /** Right-aligned content inside the control (e.g. a balance). */
  trailing?: ReactNode;
};

/** A field that opens a selection sheet or picker. Shows the current choice with a chevron. */
export function SelectRow({ label, value, placeholder, onPress, icon, iconColor, hint, error, disabled = false, lockedReason, compact = false, trailing }: SelectRowProps) {
  const { colors } = useTheme();
  const locked = Boolean(lockedReason);

  if (compact) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityHint="Seçim siyahısını açır"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        scaleTo={0.98}
        containerStyle={styles.compactSlot}
        pressedStyle={{ backgroundColor: colors.surfaceInteractive }}
        style={[styles.compactRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {icon ? <Ionicons name={icon} size={16} color={iconColor ?? colors.textMuted} /> : null}
        <AppText variant="meta" color="textSecondary" numberOfLines={1}>
          {label}:{' '}
          <AppText variant="meta" color="textPrimary">
            {value ?? placeholder}
          </AppText>
        </AppText>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </PressableScale>
    );
  }

  return (
    <View style={styles.container}>
      <AppText variant="meta" color="textSecondary">
        {label}
      </AppText>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}`}
        accessibilityHint={error ?? (locked ? lockedReason : 'Seçim siyahısını açır')}
        accessibilityState={{ disabled: disabled || locked }}
        disabled={disabled || locked}
        onPress={onPress}
        scaleTo={0.99}
        containerStyle={styles.full}
        style={[styles.inputRow, { backgroundColor: locked ? colors.surfaceSubtle : colors.surface, borderColor: error ? colors.error : colors.border }]}>
        {icon ? <Ionicons name={icon} size={18} color={iconColor ?? colors.textMuted} /> : null}
        <View style={styles.selectText}>
          <AppText variant="body" color={value ? 'textPrimary' : 'textPlaceholder'} numberOfLines={1}>
            {value ?? placeholder}
          </AppText>
          {hint ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1}>
              {hint}
            </AppText>
          ) : null}
        </View>
        {trailing}
        <Ionicons name={locked ? 'lock-closed-outline' : 'chevron-down'} size={18} color={colors.textMuted} />
      </PressableScale>
      <FieldMessage error={error} hint={locked ? lockedReason : undefined} />
    </View>
  );
}

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, description, value, onChange, disabled = false }: SwitchRowProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.switchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#FFFFFF" />
    </View>
  );
}

/** Group of fields on one white surface with hairline separators (settings-style). */
export function FieldGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
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
    gap: Spacing.xxs,
  },
  inputRow: {
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
    ...Type.body,
    fontSize: 16,
    paddingVertical: Spacing.sm,
  },
  trailingButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectText: {
    flex: 1,
    paddingVertical: Spacing.xs,
  },
  message: {
    paddingTop: Spacing.xxs,
  },
  compactSlot: {
    flexShrink: 1,
    minWidth: 0,
    minHeight: MinTouchTarget - 4,
    justifyContent: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: 40,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  group: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
});
