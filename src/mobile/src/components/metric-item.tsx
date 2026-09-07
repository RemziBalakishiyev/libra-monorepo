import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/animated-number';
import { AppText, formatAmount } from '@/components/text';
import { Spacing, type TypeName } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type MetricItemProps = {
  label: string;
  amount: number;
  currencyCode: string;
  /** Income and expense metrics get an arrow icon so the meaning does not rely on colour. */
  flow?: 'Income' | 'Expense' | 'Net' | 'Average';
  variant?: TypeName;
  align?: 'left' | 'center' | 'right';
};

/** Label over an animated value: the income / expense / net row. */
export function MetricItem({ label, amount, currencyCode, flow, variant = 'subheading', align = 'left' }: MetricItemProps) {
  const { colors } = useTheme();
  const icon = flow === 'Income' ? 'arrow-down-circle' : flow === 'Expense' ? 'arrow-up-circle' : flow === 'Average' ? 'calendar-outline' : null;
  const iconColor = flow === 'Income' ? colors.incomeText : flow === 'Expense' ? colors.expenseText : colors.textMuted;
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  return (
    <View style={[styles.item, { alignItems }]} accessible accessibilityLabel={`${label}: ${formatAmount(amount, currencyCode)}`}>
      <View style={styles.labelRow}>
        {icon ? <Ionicons name={icon} size={14} color={iconColor} /> : null}
        <AppText variant="meta" color="textSecondary" numberOfLines={1}>
          {label}
        </AppText>
      </View>
      <AnimatedNumber value={amount} currencyCode={currencyCode} variant={variant} showCode={false} highlightNegative={flow === 'Net'} />
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: Spacing.xxs,
    minWidth: 0,
    flexShrink: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
