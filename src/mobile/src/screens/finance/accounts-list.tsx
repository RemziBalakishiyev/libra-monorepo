import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountItem } from '@/components/account-item';
import { IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { FilterToggle } from '@/components/filter-toggle';
import { FieldGroup } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { Layout, Spacing } from '@/constants/theme';
import { useAccounts } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Account } from '@/lib/api/finance';

interface CurrencyGroup {
  currencyCode: string;
  accounts: Account[];
  /** Σ balances of non-archived accounts included in the total — the same number the dashboard shows. */
  total: number;
}

/** Groups accounts by currency in API order; totals follow the dashboard rule (docs/DOMAIN.md). */
export function groupAccountsByCurrency(accounts: readonly Account[]): CurrencyGroup[] {
  const groups: CurrencyGroup[] = [];
  for (const account of accounts) {
    let group = groups.find((item) => item.currencyCode === account.currencyCode);
    if (!group) {
      group = { currencyCode: account.currencyCode, accounts: [], total: 0 };
      groups.push(group);
    }
    group.accounts.push(account);
    if (account.isIncludedInTotal && !account.isArchived) {
      group.total = Math.round((group.total + account.currentBalance) * 100) / 100;
    }
  }
  return groups;
}

/** All accounts grouped by currency, with archived ones behind a compact secondary filter. */
export function AccountsListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const accounts = useAccounts(includeArchived);

  const openNew = () => router.push('/finance/accounts/new');

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await accounts.refetch();
    } finally {
      setRefreshing(false);
    }
  };

  let content: ReactNode;
  if (accounts.isPending) {
    content = (
      <Entrance index={2}>
        <FieldGroup style={styles.skeletonSurface}>
          <ListSkeleton rows={4} label="Hesablar yüklənir…" />
        </FieldGroup>
      </Entrance>
    );
  } else if (accounts.isError) {
    content = <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;
  } else if (accounts.data.length === 0) {
    content = (
      <Entrance index={2}>
        <EmptyState
          icon="wallet-outline"
          title="Hələ hesab yoxdur"
          message={includeArchived ? 'Arxivdə də hesab yoxdur. Nağd, kart və ya bank hesabınızı əlavə edin.' : 'Nağd, kart və ya bank hesabınızı əlavə edin; balanslar burada görünəcək.'}
          actionTitle="Hesab yarat"
          onAction={openNew}
        />
      </Entrance>
    );
  } else {
    content = (
      <FlatList
        data={groupAccountsByCurrency(accounts.data)}
        keyExtractor={(group) => group.currencyCode}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: Spacing.xxl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item: group, index }) => (
          <Entrance index={index + 2}>
            <CurrencyGroupSection group={group} onOpen={(account) => router.push(`/finance/accounts/${account.id}`)} />
          </Entrance>
        )}
      />
    );
  }

  return (
    <Screen scroll={false} maxWidth={Layout.maxContent} testID="accounts-list">
      <Entrance index={0}>
        <ScreenHeader back title="Hesablar" size="compact" trailing={<IconButton icon="add" accessibilityLabel="Yeni hesab" accessibilityHint="Yeni hesab formasını açır" onPress={openNew} variant="primary" />} />
      </Entrance>
      <View style={styles.body}>
        <Entrance index={1} style={styles.filterRow}>
          <FilterToggle label="Arxivdəkilər" value={includeArchived} onChange={setIncludeArchived} accessibilityHint="Arxivlənmiş hesabları siyahıya əlavə edir" />
        </Entrance>
        {content}
      </View>
    </Screen>
  );
}

/** Currency heading with the included total, then the accounts on one white surface with hairlines. */
function CurrencyGroupSection({ group, onOpen }: { group: CurrencyGroup; onOpen: (account: Account) => void }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader} accessible accessibilityRole="header" accessibilityLabel={`${group.currencyCode}, ${group.accounts.length} hesab, ümumi balans ${formatAmount(group.total, group.currencyCode)}`}>
        <View style={styles.groupTitle}>
          <AppText variant="subheading" numberOfLines={1}>
            {group.currencyCode}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {group.accounts.length} hesab
          </AppText>
        </View>
        <View style={styles.groupTotal}>
          <MoneyText amount={group.total} currencyCode={group.currencyCode} variant="subheading" showCode={false} highlightNegative />
          <AppText variant="caption" color="textMuted">
            Cəmə daxil olan balans
          </AppText>
        </View>
      </View>
      <FieldGroup style={styles.groupSurface}>
        {group.accounts.map((account, index) => (
          <AccountItem
            key={account.id}
            account={{
              id: account.id,
              name: account.name,
              type: account.type,
              currencyCode: account.currencyCode,
              balance: account.currentBalance,
              isIncludedInTotal: account.isIncludedInTotal,
              isArchived: account.isArchived,
            }}
            onPress={() => onOpen(account)}
            isLast={index === group.accounts.length - 1}
            onSurface
          />
        ))}
      </FieldGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: Spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.xxl,
  },
  group: {
    gap: Spacing.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  groupTitle: {
    flex: 1,
    gap: Spacing.xxs,
  },
  groupTotal: {
    alignItems: 'flex-end',
    gap: Spacing.xxs,
  },
  groupSurface: {
    paddingHorizontal: Spacing.lg,
  },
  skeletonSurface: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
