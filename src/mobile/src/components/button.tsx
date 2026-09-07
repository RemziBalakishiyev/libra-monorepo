import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  /** Replaces the label while true (e.g. "Əlavə olundu"). Height never changes and the control is never dimmed. */
  success?: boolean;
  successTitle?: string;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
  /** Overrides the accessible name when the visible title is not descriptive enough. */
  accessibilityLabel?: string;
};

/**
 * The action button. Default, pressed (3% scale), disabled (45% opacity), loading (spinner in place of the
 * label at the same height so the layout never jumps), and success (readable check + label, full opacity).
 */
export function Button({ title, onPress, variant = 'primary', size = 'md', loading = false, disabled, success = false, successTitle, icon, style, testID, accessibilityHint, accessibilityLabel }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = Boolean(disabled) || loading || success;
  const palette = {
    primary: { background: colors.primary, label: colors.onPrimary, border: colors.primary },
    secondary: { background: colors.surfaceSubtle, label: colors.textPrimary, border: colors.surfaceSubtle },
    soft: { background: colors.primarySoft, label: colors.primaryText, border: colors.primarySoft },
    ghost: { background: 'transparent', label: colors.primaryText, border: 'transparent' },
    danger: { background: colors.expenseSoft, label: colors.expenseText, border: colors.expenseSoft },
  }[variant];
  const background = success ? colors.incomeText : palette.background;
  const labelColor = success ? '#FFFFFF' : palette.label;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={success && successTitle ? successTitle : (accessibilityLabel ?? title)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLiveRegion={success ? 'polite' : undefined}
      disabled={isDisabled}
      dimWhenDisabled={!success && !loading}
      onPress={onPress}
      testID={testID}
      containerStyle={style}
      pressedStyle={variant === 'primary' && !success ? { backgroundColor: colors.primaryPressed } : { backgroundColor: colors.surfaceInteractive }}
      style={[styles.button, size === 'sm' ? styles.small : null, { backgroundColor: background, borderColor: success ? colors.incomeText : palette.border }]}>
      {loading ? (
        <ActivityIndicator color={labelColor} accessibilityLabel="Gözləyin" />
      ) : (
        <View style={styles.label}>
          {success ? <Ionicons name="checkmark-circle" size={20} color={labelColor} /> : icon ? <Ionicons name={icon} size={18} color={labelColor} /> : null}
          <AppText variant={size === 'sm' ? 'meta' : 'bodyStrong'} style={{ color: labelColor }} numberOfLines={1}>
            {success && successTitle ? successTitle : title}
          </AppText>
        </View>
      )}
    </PressableScale>
  );
}

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  variant?: 'plain' | 'filled' | 'primary' | 'onHero';
  size?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
};

/** Icon-only action with a 48 pt target regardless of icon size. */
export function IconButton({ icon, accessibilityLabel, onPress, variant = 'plain', size = 22, disabled, style, testID, accessibilityHint }: IconButtonProps) {
  const { colors } = useTheme();
  const background = variant === 'primary' ? colors.primary : variant === 'filled' ? colors.surfaceSubtle : variant === 'onHero' ? 'rgba(255,255,255,0.14)' : 'transparent';
  const tint = variant === 'primary' ? colors.onPrimary : variant === 'onHero' ? colors.onHero : colors.textPrimary;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      testID={testID}
      pressedStyle={variant === 'primary' ? { backgroundColor: colors.primaryPressed } : { backgroundColor: colors.surfaceInteractive }}
      style={[styles.icon, { backgroundColor: background }, style]}>
      <Ionicons name={icon} size={size} color={tint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 40,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.sm + 2,
  },
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
