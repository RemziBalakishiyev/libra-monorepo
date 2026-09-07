import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { FieldMessage } from '@/components/form-field';
import { AppText } from '@/components/text';
import { Radius, Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AmountInputProps = Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> & {
  value: string;
  onChangeText: (value: string) => void;
  currencyCode: string | undefined;
  error?: string;
  /** Increment to play a short horizontal shake (invalid submit). */
  shakeKey?: number;
  /** `hero` = large centred number; `field` = compact left-aligned number on a surface. */
  layout?: 'hero' | 'field';
  flow?: 'Expense' | 'Income' | 'Transfer';
  helper?: string;
  label?: string;
};

/**
 * Keeps digits and at most one decimal separator (comma or point); never reformats grouping, so the cursor never
 * jumps and paste works. Extra decimals are left in place so the two-decimal rule surfaces as a visible
 * validation message instead of being silently truncated.
 */
export function sanitizeAmount(input: string): string {
  const normalized = input.replace(/[^\d.,]/g, '');
  const separatorIndex = normalized.search(/[.,]/);
  if (separatorIndex === -1) {
    return normalized.slice(0, 13);
  }
  const whole = normalized.slice(0, separatorIndex).replace(/[.,]/g, '').slice(0, 13);
  const separator = normalized[separatorIndex]!;
  const fraction = normalized.slice(separatorIndex + 1).replace(/[.,]/g, '');
  return `${whole}${separator}${fraction}`;
}

/**
 * The main focus of the transaction form. Decimal keyboard, paste and hardware keyboard friendly, validation
 * right under the number, and a 300 ms shake when a submit is rejected (dropped under reduced motion).
 */
export function AmountInput({ value, onChangeText, currencyCode, error, shakeKey = 0, layout = 'hero', flow = 'Expense', helper, label = 'Məbləğ', editable = true, onFocus, onBlur, ...rest }: AmountInputProps) {
  const { colors, reducedMotion } = useTheme();
  const [focused, setFocused] = useState(false);
  const shake = useSharedValue(0);
  const tint = flow === 'Income' ? colors.incomeText : flow === 'Transfer' ? colors.transferText : colors.textPrimary;
  const isHero = layout === 'hero';

  useEffect(() => {
    if (shakeKey === 0 || reducedMotion) {
      return;
    }
    shake.set(withSequence(withTiming(-6, { duration: 50 }), withTiming(6, { duration: 60 }), withTiming(-4, { duration: 60 }), withTiming(3, { duration: 60 }), withTiming(0, { duration: 70 })));
  }, [shakeKey, reducedMotion, shake]);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <View style={[styles.container, isHero ? styles.heroContainer : { backgroundColor: colors.surface, borderColor: error ? colors.error : colors.border }]}>
      {!isHero ? (
        <AppText variant="meta" color="textSecondary">
          {label}
          {currencyCode ? ` · ${currencyCode}` : ''}
        </AppText>
      ) : null}
      <Animated.View style={[styles.row, isHero ? styles.heroRow : null, shakeStyle]}>
        <TextInput
          accessibilityLabel={`${label}${currencyCode ? ` (${currencyCode})` : ''}`}
          accessibilityHint={error}
          accessibilityState={{ disabled: !editable }}
          value={value}
          onChangeText={(text) => onChangeText(sanitizeAmount(text))}
          editable={editable}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0,00"
          placeholderTextColor={colors.textPlaceholder}
          maxLength={16}
          selectTextOnFocus
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, isHero ? styles.heroInput : styles.fieldInput, { color: error ? colors.error : tint, opacity: editable ? 1 : 0.7 }, isHero ? { width: heroWidth(value) } : null]}
          {...rest}
        />
        {isHero ? (
          <AppText variant="subheading" color="textSecondary" style={styles.heroCode}>
            {currencyCode ?? '—'}
          </AppText>
        ) : null}
      </Animated.View>
      {isHero ? <View style={[styles.focusLine, { backgroundColor: error ? colors.error : focused ? colors.primary : colors.border, width: heroWidth(value) }]} /> : null}
      <View style={isHero ? styles.heroMessage : null}>
        <FieldMessage error={error} hint={helper} />
      </View>
    </View>
  );
}

/** Tabular digits at 40 px are ~23 px wide; the placeholder "0,00" sets the minimum. */
function heroWidth(value: string): number {
  const glyphs = Math.min(Math.max(value.length, 4), 14);
  return glyphs * 23 + 12;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  heroContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroRow: {
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  input: {
    fontVariant: ['tabular-nums'],
    padding: 0,
    margin: 0,
    // The hero number shows focus with the underline below instead of the browser's box outline.
    outlineWidth: 0,
  },
  focusLine: {
    height: 2,
    borderRadius: 1,
    marginTop: Spacing.xxs,
  },
  heroInput: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '700',
    letterSpacing: -0.8,
    textAlign: 'center',
    flexShrink: 1,
  },
  fieldInput: {
    ...Type.title,
    flex: 1,
    paddingVertical: Spacing.xs,
  },
  heroCode: {
    marginBottom: 6,
  },
  heroMessage: {
    alignItems: 'center',
  },
});
