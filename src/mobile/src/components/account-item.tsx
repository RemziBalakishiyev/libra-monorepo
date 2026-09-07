import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { AppText, MoneyText, spokenMoney } from '@/components/text';
import { accountVisual } from '@/constants/categories';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface AccountItemData {
  id: string;
  name: string;
  type: string;
  currencyCode: string;
  balance: number;
  isIncludedInTotal: boolean;
  isArchived?: boolean;
}

type AccountItemProps = {
  account: AccountItemData;
  onPress?: () => void;
  isLast?: boolean;
  onSurface?: boolean;
};

/** One account row: icon tile, name, type metadata, balance. */
export function AccountItem({ account, onPress, isLast = false, onSurface = false }: AccountItemProps) {
  const { colors } = useTheme();
  const visual = accountVisual(account.type);
  const metaParts = [visual.label, account.currencyCode];
  if (!account.isIncludedInTotal) {
    metaParts.push('cəmə daxil deyil');
  }
  if (account.isArchived) {
    metaParts.push('arxivdə');
  }
  const meta = metaParts.join(' · ');

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${account.name}, ${meta}, ${spokenMoney(account.balance, account.currencyCode)}`}
      onPress={onPress}
      disabled={!onPress}
      scaleTo={0.99}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.row, { borderBottomColor: colors.border, backgroundColor: onSurface ? colors.surface : 'transparent' }, isLast ? styles.last : null, account.isArchived ? styles.archived : null]}>
      <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={visual.icon} size={18} color={colors.primary} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {account.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {meta}
        </AppText>
      </View>
      <MoneyText amount={account.balance} currencyCode={account.currencyCode} highlightNegative variant="bodyStrong" showCode={false} />
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.textDisabled} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 12,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: {
    borderBottomWidth: 0,
  },
  archived: {
    opacity: 0.7,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: 1,
  },
});
