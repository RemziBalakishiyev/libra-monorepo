import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText, MoneyText, formatAmount } from '@/components/text';
import { accountVisual } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Account } from '@/lib/api/finance';
import { addAmounts } from '@/lib/money';

type AccountEffectProps = {
  account: Account | undefined;
  /** Signed change to the balance. Null when nothing will move (an obligation recorded as already existing). */
  delta: number | null;
  /** Read out with the figures, e.g. "Hesabın balansı". */
  label?: string;
  testID?: string;
};

/**
 * What confirming will do to one account, before it is done: the balance now, the arrow, the balance after.
 * A null delta says plainly that no money moves, which is the honest answer for an existing obligation.
 */
export function AccountEffect({ account, delta, label = 'Hesaba təsiri', testID }: AccountEffectProps) {
  const { colors } = useTheme();

  if (!account) {
    return null;
  }

  const after = delta === null ? account.currentBalance : addAmounts(account.currentBalance, delta);
  const spoken =
    delta === null
      ? `${label}: ${account.name}, balans dəyişmir, ${formatAmount(account.currentBalance, account.currencyCode)}`
      : `${label}: ${account.name}, ${formatAmount(account.currentBalance, account.currencyCode)} → ${formatAmount(after, account.currencyCode)}`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceSubtle }]} accessible accessibilityLabel={spoken} testID={testID}>
      <Ionicons name={accountVisual(account.type).icon} size={18} color={colors.textSecondary} />
      <View style={styles.text}>
        <AppText variant="caption" color="textMuted" numberOfLines={1}>
          {label} · {account.name}
        </AppText>
        {delta === null ? (
          <AppText variant="meta" color="textSecondary">
            Balans dəyişmir · <MoneyText variant="meta" color="textSecondary" amount={account.currentBalance} currencyCode={account.currencyCode} showCode={false} />
          </AppText>
        ) : (
          <View style={styles.row}>
            <MoneyText variant="meta" color="textSecondary" amount={account.currentBalance} currencyCode={account.currencyCode} showCode={false} />
            <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
            <MoneyText variant="bodyStrong" amount={after} currencyCode={account.currencyCode} highlightNegative showCode />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderCurve: 'continuous',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
});
