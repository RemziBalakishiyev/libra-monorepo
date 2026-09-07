import { StyleSheet, Text, type TextProps } from 'react-native';

import { Type, type ThemeColor, type TypeName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';

export type TextColor = Extract<
  ThemeColor,
  | 'textPrimary'
  | 'textSecondary'
  | 'textMuted'
  | 'textPlaceholder'
  | 'textDisabled'
  | 'onPrimary'
  | 'onHero'
  | 'onHeroMuted'
  | 'primary'
  | 'primaryText'
  | 'income'
  | 'incomeText'
  | 'expense'
  | 'expenseText'
  | 'transfer'
  | 'transferText'
  | 'warning'
  | 'warningText'
  | 'error'
>;

export type AppTextProps = TextProps & {
  variant?: TypeName;
  color?: TextColor;
  align?: 'left' | 'center' | 'right';
};

/** The only text primitive. Variants come from the type ramp; colours from the semantic palette. */
export function AppText({ variant = 'body', color = 'textPrimary', align, style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  return <Text style={[Type[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]} {...rest} />;
}

type MoneyTextProps = Omit<AppTextProps, 'children'> & {
  amount: number;
  currencyCode: string;
  /** Adds a sign and colours income/expense; the sign keeps the meaning readable without colour. */
  flow?: 'Income' | 'Expense' | 'Transfer';
  /** Colours negative values with the expense colour (balances). */
  highlightNegative?: boolean;
  /** Renders the ISO code after the number. */
  showCode?: boolean;
};

/**
 * Monetary value with tabular numerals so digits keep their width while a value animates. Semantic colouring
 * uses the `*Text` foregrounds so the number stays readable on white and on the soft surfaces.
 */
export function MoneyText({ amount, currencyCode, flow, highlightNegative = false, showCode = true, color, style, accessibilityLabel, ...rest }: MoneyTextProps) {
  let resolved: TextColor | undefined = color;
  if (flow === 'Income') {
    resolved = 'incomeText';
  } else if (flow === 'Expense') {
    resolved = 'expenseText';
  } else if (flow === 'Transfer') {
    resolved = 'transferText';
  } else if (highlightNegative && amount < 0) {
    resolved = 'expenseText';
  }
  const sign = flow === 'Income' ? '+' : flow === 'Expense' ? '−' : '';
  const text = `${sign}${formatAmount(flow && flow !== 'Transfer' ? Math.abs(amount) : amount, currencyCode, showCode)}`;
  return (
    <AppText color={resolved} style={[styles.tabular, style]} accessibilityLabel={accessibilityLabel ?? spokenMoney(amount, currencyCode, flow)} {...rest}>
      {text}
    </AppText>
  );
}

/** "1.234,56 AZN" (with code) or "1.234,56" — one locale-aware formatter for every screen (lib/money). */
export function formatAmount(amount: number, currencyCode: string, showCode = true): string {
  return formatMoney(amount, currencyCode, { showCode });
}

/** Screen-reader friendly value: "Xərc 24,50 AZN". */
export function spokenMoney(amount: number, currencyCode: string, flow?: 'Income' | 'Expense' | 'Transfer'): string {
  const prefix = flow === 'Income' ? 'Gəlir ' : flow === 'Expense' ? 'Xərc ' : flow === 'Transfer' ? 'Köçürmə ' : '';
  return `${prefix}${formatAmount(Math.abs(amount), currencyCode, true)}${amount < 0 && !flow ? ' mənfi' : ''}`;
}

const styles = StyleSheet.create({
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
