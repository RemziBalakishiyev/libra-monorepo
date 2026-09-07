import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { SelectRow } from '@/components/form-field';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl, type SegmentOption } from '@/components/segmented-control';
import { SelectionSheet, type SelectionOption } from '@/components/selection-sheet';
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { TransactionRow, describeTransaction } from '@/components/transaction-row';
import { accountVisual, categoryColor, categoryVisual } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useAccounts, useCategories, useDeleteTransaction, useTransactions } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Transaction, TransactionType } from '@/lib/api/finance';
import { confirmAsync } from '@/lib/confirm';
import { formatLongDate, formatRelativeDay, formatShortDate, isoDateOf } from '@/lib/dates';
import { successHaptic } from '@/lib/haptics';

type TypeFilter = 'All' | TransactionType;

const typeOptions: readonly SegmentOption<TypeFilter>[] = [
  { value: 'All', label: 'Hamısı' },
  { value: 'Expense', label: 'Xərc', tint: 'expense' },
  { value: 'Income', label: 'Gəlir', tint: 'income' },
];

/** Value of the "Hamısı" option in both selection sheets: no filter. */
const ALL = '';

type DayHeaderItem = {
  kind: 'day';
  key: string;
  label: string;
  count: number;
  /** Income minus expense for the day; null when the day mixes currencies (never summed, D-027). */
  net: { amount: number; currencyCode: string } | null;
};

type TransactionItem = {
  kind: 'transaction';
  key: string;
  transaction: Transaction;
  isFirst: boolean;
  isLast: boolean;
};

type ListItem = DayHeaderItem | TransactionItem;

/** "Bu gün" / "Dünən" for the last two days, otherwise the full localised date. */
function dayLabel(utcIso: string, now: Date): string {
  const relative = formatRelativeDay(utcIso, now);
  return relative === formatShortDate(utcIso, now) ? formatLongDate(utcIso) : relative;
}

function dayNet(group: Transaction[]): DayHeaderItem['net'] {
  const currencyCode = group[0]!.currencyCode;
  if (group.some((transaction) => transaction.currencyCode !== currencyCode)) {
    return null;
  }
  const amount = group.reduce((sum, transaction) => sum + (transaction.type === 'Income' ? transaction.amount : -transaction.amount), 0);
  return { amount: Math.round(amount * 100) / 100, currencyCode };
}

/** Flattens the pages into day headers followed by their rows, grouped by the device's local calendar day. */
function groupByDay(transactions: Transaction[], now = new Date()): ListItem[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const day = isoDateOf(new Date(transaction.occurredAtUtc));
    const group = groups.get(day);
    if (group) {
      group.push(transaction);
    } else {
      groups.set(day, [transaction]);
    }
  }
  const items: ListItem[] = [];
  for (const [day, group] of groups) {
    items.push({ kind: 'day', key: `day-${day}`, label: dayLabel(group[0]!.occurredAtUtc, now), count: group.length, net: dayNet(group) });
    group.forEach((transaction, index) => {
      items.push({ kind: 'transaction', key: transaction.id, transaction, isFirst: index === 0, isLast: index === group.length - 1 });
    });
  }
  return items;
}

export function TransactionsListScreen() {
  const router = useRouter();
  const { colors, scheme, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [type, setType] = useState<TypeFilter>('All');
  const [accountId, setAccountId] = useState<string>(ALL);
  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [sheet, setSheet] = useState<'account' | 'category' | null>(null);
  const accounts = useAccounts(true);
  const categories = useCategories(undefined, true);
  const transactions = useTransactions({
    type: type === 'All' ? undefined : type,
    accountId: accountId || undefined,
    categoryId: categoryId || undefined,
  });
  const remove = useDeleteTransaction();

  const wide = layout === 'wide';
  const rows = transactions.data?.pages.flatMap((page) => page.items) ?? [];
  const totalCount = transactions.data?.pages[0]?.totalCount ?? 0;
  const items = transactions.isSuccess ? groupByDay(rows) : [];
  const selectedAccount = accounts.data?.find((account) => account.id === accountId);
  const selectedCategory = categories.data?.find((category) => category.id === categoryId);
  const hasFilters = type !== 'All' || accountId !== ALL || categoryId !== ALL;

  const accountOptions: SelectionOption<string>[] = [
    { value: ALL, label: 'Hamısı', icon: 'apps-outline' },
    ...(accounts.data ?? []).map((account) => ({
      value: account.id,
      label: account.name,
      hint: account.isArchived ? `${account.currencyCode} · arxivdə` : account.currencyCode,
      icon: accountVisual(account.type).icon,
      iconColor: colors.primary,
    })),
  ];

  const categoryOptions: SelectionOption<string>[] = [
    { value: ALL, label: 'Hamısı', icon: 'apps-outline' },
    ...(categories.data ?? [])
      .filter((category) => type === 'All' || category.kind === type)
      .map((category) => ({
        value: category.id,
        label: category.name,
        hint: `${category.kind === 'Income' ? 'Gəlir' : 'Xərc'}${category.isArchived ? ' · arxivdə' : ''}`,
        icon: categoryVisual(category.name, category.kind).icon,
        iconColor: categoryColor(category.name, scheme, category.kind),
      })),
  ];

  const changeType = (next: TypeFilter) => {
    setType(next);
    // A category of the other kind can never match the new type; drop it instead of hiding an active filter.
    if (next !== 'All' && selectedCategory && selectedCategory.kind !== next) {
      setCategoryId(ALL);
    }
  };

  const resetFilters = () => {
    setType('All');
    setAccountId(ALL);
    setCategoryId(ALL);
  };

  const onDelete = async (transaction: Transaction) => {
    if (remove.isPending) {
      return;
    }
    const confirmed = await confirmAsync('Əməliyyatı sil', `${describeTransaction(transaction)} silinsin? Balans və büdcə dərhal yenilənəcək.`);
    if (!confirmed) {
      return;
    }
    try {
      await remove.mutateAsync(transaction.id);
      toast({ title: 'Əməliyyat silindi' });
      successHaptic();
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const loadMore = () => {
    if (transactions.hasNextPage && !transactions.isFetchingNextPage) {
      void transactions.fetchNextPage();
    }
  };

  const renderItem: ListRenderItem<ListItem> = ({ item }) => {
    if (item.kind === 'day') {
      return <DayHeader item={item} />;
    }
    return (
      <View style={[styles.rowWrap, { backgroundColor: colors.surface, borderColor: colors.border }, item.isFirst ? styles.rowFirst : null, item.isLast ? styles.rowLast : null]}>
        <TransactionRow
          transaction={item.transaction}
          onSurface
          isLast={item.isLast}
          onPress={() => router.push(`/finance/transactions/${item.transaction.id}`)}
          onDelete={() => void onDelete(item.transaction)}
        />
      </View>
    );
  };

  const filters = (
    <View style={[styles.filters, wide ? styles.filtersWide : null]}>
      <SegmentedControl options={typeOptions} value={type} onChange={changeType} accessibilityLabel="Növ" size="sm" />
      <View style={wide ? styles.selectColumn : styles.selectRow}>
        <SelectRow
          compact
          label="Hesab"
          value={selectedAccount?.name ?? 'Hamısı'}
          placeholder="Hamısı"
          icon={selectedAccount ? accountVisual(selectedAccount.type).icon : 'wallet-outline'}
          iconColor={selectedAccount ? colors.primary : undefined}
          onPress={() => setSheet('account')}
        />
        <SelectRow
          compact
          label="Kateqoriya"
          value={selectedCategory?.name ?? 'Hamısı'}
          placeholder="Hamısı"
          icon={selectedCategory ? categoryVisual(selectedCategory.name, selectedCategory.kind).icon : 'pricetag-outline'}
          iconColor={selectedCategory ? categoryColor(selectedCategory.name, scheme, selectedCategory.kind) : undefined}
          onPress={() => setSheet('category')}
        />
        {hasFilters ? <Button title="Sıfırla" variant="ghost" size="sm" icon="close-circle-outline" onPress={resetFilters} /> : null}
      </View>
      {transactions.isSuccess && totalCount > 0 ? (
        <AppText variant="caption" color="textMuted" accessibilityLiveRegion="polite">
          {totalCount} əməliyyat
        </AppText>
      ) : null}
    </View>
  );

  const list = (
    <FlatList
      data={items}
      keyExtractor={(item) => item.key}
      renderItem={renderItem}
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: Spacing.section + insets.bottom }}
      refreshControl={
        <RefreshControl refreshing={transactions.isRefetching && !transactions.isFetchingNextPage} onRefresh={() => void transactions.refetch()} tintColor={colors.primary} colors={[colors.primary]} />
      }
      onEndReachedThreshold={0.4}
      onEndReached={loadMore}
      ListHeaderComponent={wide ? null : filters}
      ListEmptyComponent={
        transactions.isPending ? (
          <View style={styles.skeleton}>
            <Skeleton width={72} height={12} />
            <View style={[styles.skeletonGroup, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ListSkeleton rows={6} />
            </View>
          </View>
        ) : transactions.isError ? (
          <ErrorState error={transactions.error} onRetry={() => void transactions.refetch()} />
        ) : (
          <EmptyState icon="receipt-outline" title="Əməliyyat yoxdur" message="Filtrləri dəyişin və ya yeni əməliyyat əlavə edin." actionTitle="Yeni əməliyyat" onAction={() => router.push('/quick-add')} />
        )
      }
      ListFooterComponent={
        transactions.isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.primary} accessibilityLabel="Daha çox yüklənir" />
          </View>
        ) : transactions.hasNextPage ? (
          <View style={styles.footer}>
            <Button title="Daha çox" variant="secondary" onPress={() => void transactions.fetchNextPage()} />
          </View>
        ) : null
      }
    />
  );

  return (
    <Screen scroll={false} tabInset={false}>
      <Entrance index={0}>
        <ScreenHeader back title="Əməliyyatlar" size="compact" trailing={<IconButton icon="add" accessibilityLabel="Yeni əməliyyat" variant="primary" onPress={() => router.push('/finance/transactions/new?type=Expense')} />} />
      </Entrance>
      <Entrance index={1} style={styles.flex}>
        {wide ? (
          <View style={styles.columns}>
            <View style={styles.aside}>{filters}</View>
            <View style={styles.flex}>{list}</View>
          </View>
        ) : (
          list
        )}
        <SelectionSheet
          visible={sheet === 'account'}
          title="Hesab"
          options={accountOptions}
          value={accountId}
          onSelect={(value) => {
            setAccountId(value);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
          emptyMessage="Hesab yoxdur."
        />
        <SelectionSheet
          visible={sheet === 'category'}
          title="Kateqoriya"
          options={categoryOptions}
          value={categoryId}
          onSelect={(value) => {
            setCategoryId(value);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
          emptyMessage="Bu növ üçün kateqoriya yoxdur."
        />
      </Entrance>
    </Screen>
  );
}

/** Day divider: relative label on the left, the day's net (sign carries the meaning) or its count on the right. */
function DayHeader({ item }: { item: DayHeaderItem }) {
  const net = item.net;
  const flow = net && net.amount > 0 ? 'Income' : net && net.amount < 0 ? 'Expense' : undefined;
  const spoken = net ? `xalis ${formatAmount(net.amount, net.currencyCode)}` : `${item.count} əməliyyat`;

  return (
    <View style={styles.dayHeader} accessible accessibilityRole="header" accessibilityLabel={`${item.label}, ${spoken}`}>
      <AppText variant="meta" color="textSecondary" numberOfLines={1} style={styles.flex}>
        {item.label}
      </AppText>
      {net ? (
        <MoneyText variant="meta" color="textSecondary" amount={Math.abs(net.amount)} currencyCode={net.currencyCode} flow={flow} showCode={false} />
      ) : (
        <AppText variant="caption" color="textMuted">
          {item.count} əməliyyat
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  columns: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.xxxl,
  },
  aside: {
    width: 300,
  },
  filters: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  filtersWide: {
    paddingBottom: 0,
  },
  selectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  selectColumn: {
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: 28,
    paddingBottom: Spacing.sm,
  },
  rowWrap: {
    paddingHorizontal: Spacing.lg,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  skeleton: {
    gap: Spacing.sm,
  },
  skeletonGroup: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
