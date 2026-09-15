import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { FilterToggle } from '@/components/filter-toggle';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { EmptyState, ErrorState, ListSkeleton, Skeleton, StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useDebtSummary, useDebts } from '@/hooks/use-debts';
import { useTheme } from '@/hooks/use-theme';
import type { Debt, DebtDirection } from '@/lib/api/debts';
import { directionLabels, dueLabel, statusLabels } from '@/lib/debts';

/**
 * Borclar: two views — "Mənə borcludurlar" (receivables) and "Mən borcluyam" (payables). The strip at the top
 * is the outstanding balance per currency over every debt, from the server, never a sum of the rows on screen.
 * A receivable is shown as what is owed to the user; it is never added to cash.
 */
export function DebtsListScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const [direction, setDirection] = useState<DebtDirection>('Receivable');
  const [includeSettled, setIncludeSettled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const debts = useDebts({ direction, includeSettled });
  const summary = useDebtSummary();
  const wide = layout === 'wide';

  const onRefresh = () => {
    setRefreshing(true);
    void Promise.allSettled([debts.refetch(), summary.refetch()]).finally(() => setRefreshing(false));
  };

  const strip = (() => {
    if (summary.isPending) {
      return (
        <View style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Qalıq yüklənir…" accessibilityLiveRegion="polite">
          <Skeleton width={120} height={12} />
          <Skeleton width="50%" height={28} radius={Radius.md} />
        </View>
      );
    }
    const currencies = summary.data?.currencies ?? [];
    const relevant = currencies.filter((entry) => (direction === 'Receivable' ? entry.receivableOutstanding > 0 || entry.overdueReceivable > 0 : entry.payableOutstanding > 0 || entry.overduePayable > 0));
    return (
      <View style={[styles.strip, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="debt-summary">
        <AppText variant="caption" color="textMuted">
          {direction === 'Receivable' ? 'Mənə qalan alacaq' : 'Mənə qalan borc'}
        </AppText>
        {relevant.length === 0 ? (
          <AppText variant="bodyStrong" color="textSecondary">
            Qalıq yoxdur
          </AppText>
        ) : (
          relevant.map((entry) => {
            const outstanding = direction === 'Receivable' ? entry.receivableOutstanding : entry.payableOutstanding;
            const overdue = direction === 'Receivable' ? entry.overdueReceivable : entry.overduePayable;
            return (
              <View key={entry.currencyCode} style={styles.stripLine} accessible accessibilityLabel={`${formatAmount(outstanding, entry.currencyCode)} qalıb${overdue > 0 ? `, ${formatAmount(overdue, entry.currencyCode)} gecikib` : ''}`}>
                <MoneyText variant="heading" amount={outstanding} currencyCode={entry.currencyCode} testID={`debt-outstanding-${entry.currencyCode}`} />
                {overdue > 0 ? (
                  <View style={[styles.chip, { backgroundColor: colors.warningSoft }]}>
                    <AppText variant="caption" color="warningText" testID={`debt-overdue-${entry.currencyCode}`}>
                      Gecikib: {formatAmount(overdue, entry.currencyCode, false)}
                    </AppText>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
        <AppText variant="caption" color="textMuted">
          {direction === 'Receivable' ? 'Alacaq nağd pul deyil; hesab balansına daxil edilmir.' : 'Qalan əsas borc; faiz hesablanmır.'}
        </AppText>
      </View>
    );
  })();

  const body = (() => {
    if (debts.isPending) {
      return <ListSkeleton rows={3} label="Borclar yüklənir…" />;
    }
    if (debts.isError && !debts.data) {
      return <ErrorState error={debts.error} onRetry={() => void debts.refetch()} />;
    }
    const items = debts.data?.items ?? [];
    if (items.length === 0) {
      return (
        <EmptyState
          icon="people-outline"
          accent={colors.moduleFinance}
          title={direction === 'Receivable' ? 'Sizə borclu olan yoxdur' : 'Borcunuz yoxdur'}
          message={includeSettled ? 'Bu istiqamətdə heç bir qeyd yoxdur.' : 'Açıq qeyd yoxdur. Mövcud öhdəliyi və ya indi verilən/alınan pulu əlavə edə bilərsiniz.'}
          actionTitle="Borc əlavə et"
          onAction={() => router.push('/finance/debts/new')}
          compact
        />
      );
    }
    return (
      <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="debt-list">
        {items.map((item, index) => (
          <DebtRow key={item.id} item={item} separator={index > 0} onPress={() => router.push({ pathname: '/finance/debts/[id]', params: { id: item.id } })} />
        ))}
        {debts.data && debts.data.totalCount > items.length ? (
          <AppText variant="caption" color="textMuted" style={styles.more}>
            {items.length} / {debts.data.totalCount} göstərilir · qalıq cəmi bütün qeydlər üzrədir
          </AppText>
        ) : null}
      </View>
    );
  })();

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} testID="debts-screen">
      <Entrance index={0}>
        <ScreenHeader
          back
          title="Borclar"
          eyebrow="Maliyyə"
          size="compact"
          trailing={<IconButton icon="add" accessibilityLabel="Borc əlavə et" accessibilityHint="Yeni alacaq və ya borc qeyd edir" variant="primary" onPress={() => router.push('/finance/debts/new')} testID="debt-add" />}
        />
      </Entrance>
      <Entrance index={1} style={styles.toolbar}>
        <SegmentedControl
          accessibilityLabel="İstiqamət"
          testID="debt-direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'Receivable', label: directionLabels.Receivable, icon: 'arrow-down-circle-outline' },
            { value: 'Payable', label: directionLabels.Payable, icon: 'arrow-up-circle-outline' },
          ]}
        />
        <View style={styles.filters}>
          <FilterToggle label="Bağlananlar da" value={includeSettled} onChange={setIncludeSettled} icon="checkmark-done-outline" accessibilityHint="Bağlanmış qeydləri də siyahıya əlavə edir" />
        </View>
      </Entrance>

      {debts.isError && debts.data ? <StaleNotice error={debts.error} onRetry={() => void debts.refetch()} /> : null}

      {wide ? (
        <View style={styles.columns}>
          <Entrance index={2} style={styles.columnMain}>
            {body}
          </Entrance>
          <Entrance index={3} style={styles.columnSide}>
            {strip}
          </Entrance>
        </View>
      ) : (
        <>
          <Entrance index={2}>{strip}</Entrance>
          <Entrance index={3}>{body}</Entrance>
        </>
      )}
    </Screen>
  );
}

function DebtRow({ item, separator, onPress }: { item: Debt; separator: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const due = dueLabel(item);
  const spoken = `${item.counterpartyName}, qalıq ${formatAmount(item.remainingAmount, item.currencyCode)}, ${statusLabels[item.status]}${due ? `, ${due}` : ''}`;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Borcun tarixçəsini və ödəniş imkanlarını açır"
      onPress={onPress}
      scaleTo={0.995}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.row, separator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}
      testID={`debt-row-${item.id}`}>
      <View style={[styles.avatar, { backgroundColor: item.isOverdue ? colors.warningSoft : colors.surfaceSubtle }]}>
        <Ionicons name={item.isOverdue ? 'alert-circle-outline' : 'person-outline'} size={18} color={item.isOverdue ? colors.warningText : colors.textSecondary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {item.counterpartyName}
        </AppText>
        <AppText variant="caption" color={item.isOverdue ? 'warningText' : 'textMuted'} numberOfLines={1}>
          {due ?? statusLabels[item.status]}
          {item.status === 'PartiallyPaid' ? ` · ${formatAmount(item.paidAmount, item.currencyCode, false)} ödənilib` : ''}
        </AppText>
      </View>
      <View style={styles.amounts}>
        <MoneyText variant="bodyStrong" amount={item.remainingAmount} currencyCode={item.currencyCode} showCode />
        {item.status === 'Settled' ? (
          <AppText variant="caption" color="textMuted">
            {statusLabels.Settled}
          </AppText>
        ) : (
          <AppText variant="caption" color="textMuted">
            / {formatAmount(item.principal, item.currencyCode, false)}
          </AppText>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minWidth: 0,
  },
  full: {
    width: '100%',
  },
  toolbar: {
    gap: Spacing.sm,
  },
  filters: {
    flexDirection: 'row',
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.huge,
    alignItems: 'flex-start',
  },
  columnMain: {
    flex: 7,
  },
  columnSide: {
    flex: 5,
  },
  strip: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.xs,
  },
  stripLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  list: {
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: MinTouchTarget + 8,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amounts: {
    alignItems: 'flex-end',
  },
  more: {
    paddingVertical: Spacing.sm,
    textAlign: 'center',
  },
});
