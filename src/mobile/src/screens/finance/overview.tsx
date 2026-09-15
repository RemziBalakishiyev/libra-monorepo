import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountItem } from '@/components/account-item';
import { BalanceHero } from '@/components/balance-hero';
import { BudgetProgress } from '@/components/budget-progress';
import { Button, IconButton } from '@/components/button';
import { CategoryBreakdown } from '@/components/category-breakdown';
import { Entrance } from '@/components/entrance';
import { InsightCard } from '@/components/insight-card';
import { MetricItem } from '@/components/metric-item';
import { QuickAction, quickActionDefinitions, type QuickActionKind } from '@/components/quick-action';
import { QuickAddMenu } from '@/components/quick-add-menu';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { SectionHeader } from '@/components/section-header';
import { Sheet } from '@/components/sheet';
import { EmptyState, ErrorState, Skeleton, StaleNotice } from '@/components/states';
import { AppText, MoneyText, formatAmount } from '@/components/text';
import { useToast } from '@/components/toast';
import { TransactionList, describeTransaction, type TransactionRowItem } from '@/components/transaction-row';
import { Radius, Spacing } from '@/constants/theme';
import { useAccounts, useDashboard, useDeleteTransaction, useMonthExpenses } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import { describeError } from '@/lib/api/errors';
import type { Dashboard } from '@/lib/api/finance';
import { confirmAsync } from '@/lib/confirm';
import { daysInMonth, formatMonth } from '@/lib/dates';
import { budgetPace, dailyExpenseSeries } from '@/lib/finance-insights';
import { quickActionHref } from '@/lib/quick-add';

/** Finance tab: onboarding when there is no account, otherwise the single-currency dashboard. */
export function FinanceOverview() {
  const router = useRouter();
  const { layout } = useTheme();
  const toast = useToast();
  const accounts = useAccounts();
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [transferGate, setTransferGate] = useState(false);
  const hasAccounts = (accounts.data?.length ?? 0) > 0;
  const dashboard = useDashboard(currency ? { currencyCode: currency } : {});
  const monthExpenses = useMonthExpenses(
    dashboard.data ? { currencyCode: dashboard.data.currencyCode, from: dashboard.data.periodStartUtc, to: dashboard.data.periodEndUtc } : undefined,
  );
  const remove = useDeleteTransaction();
  const wide = layout === 'wide';

  const onQuickAdd = (kind: QuickActionKind) => {
    setMenuOpen(false);
    if (kind === 'transfer' && (accounts.data?.length ?? 0) < 2) {
      setTransferGate(true);
      return;
    }
    router.push(quickActionHref(kind));
  };

  const onDeleteTransaction = async (transaction: TransactionRowItem) => {
    const confirmed = await confirmAsync('Əməliyyatı sil', `${describeTransaction(transaction)} silinsin? Balans və büdcə dərhal yenilənəcək.`);
    if (!confirmed) {
      return;
    }
    try {
      await remove.mutateAsync(transaction.id);
      toast({ title: 'Əməliyyat silindi', tone: 'success' });
    } catch (error) {
      toast({ title: describeError(error), tone: 'error' });
    }
  };

  const header = (
    <ScreenHeader
      title="Maliyyə"
      size="compact"
      eyebrow={dashboard.data ? formatMonth(dashboard.data.year, dashboard.data.month) : undefined}
      trailing={hasAccounts && !wide ? <IconButton icon="add" accessibilityLabel="Tez əlavə et" accessibilityHint="Xərc, gəlir və ya köçürmə əlavə et" onPress={() => setMenuOpen(true)} variant="primary" testID="finance-quick-add" /> : undefined}
    />
  );

  if (accounts.isPending) {
    return (
      <Screen tabInset contentStyle={styles.page}>
        {header}
        <DashboardSkeleton label="Hesablar yüklənir…" />
      </Screen>
    );
  }

  if (accounts.isError) {
    return (
      <Screen tabInset contentStyle={styles.page}>
        {header}
        <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
      </Screen>
    );
  }

  if (!hasAccounts) {
    return (
      <Screen tabInset contentStyle={styles.page}>
        {header}
        <EmptyState
          icon="wallet-outline"
          title="Başlayaq"
          message="Gəlir və xərcləri izləmək üçün əvvəlcə ilk hesabınızı (nağd, kart və s.) yaradın. Standart kateqoriyalar avtomatik əlavə olunacaq."
          actionTitle="Maliyyəni quraşdır"
          onAction={() => router.push('/finance/setup')}
        />
      </Screen>
    );
  }

  const data = dashboard.data;
  const totalDays = data ? daysInMonth(data.year, data.month) : 0;
  const daily = data && monthExpenses.data ? dailyExpenseSeries(monthExpenses.data.items, data.year, data.month, data.currencyCode, data.timeZone) : null;
  const seriesStatus = monthExpenses.isError ? 'unavailable' : monthExpenses.data ? 'ready' : 'loading';
  const pace = data?.overallBudget ? budgetPace(data.overallBudget.usagePercent, data.daysElapsed, totalDays) : null;

  const insight = data ? (
    <InsightCard
      animateOnMount
      seriesStatus={seriesStatus}
      onRetrySeries={() => void monthExpenses.refetch()}
      input={{
        currencyCode: data.currencyCode,
        year: data.year,
        month: data.month,
        monthlyExpense: data.monthlyExpense,
        dailyAverageExpense: data.dailyAverageExpense,
        daysElapsed: data.daysElapsed,
        daysInMonth: totalDays,
        dailyExpenses: daily,
        budget: data.overallBudget ? { amount: data.overallBudget.amount, usedAmount: data.overallBudget.usedAmount, usagePercent: data.overallBudget.usagePercent } : null,
        topCategory: data.expenseByCategory[0] ? { categoryName: data.expenseByCategory[0].categoryName, percent: data.expenseByCategory[0].percent } : null,
      }}
    />
  ) : null;

  const recent = data ? (
    <Entrance index={4} style={styles.section}>
      <SectionHeader title="Son əməliyyatlar" actionTitle="Hamısı" onAction={() => router.push('/finance/transactions')} />
      <TransactionList
        transactions={data.recentTransactions}
        onPress={(transaction) => router.push(`/finance/transactions/${transaction.id}`)}
        onDelete={(transaction) => void onDeleteTransaction(transaction)}
        empty={
          <AppText color="textSecondary" style={styles.emptyLine}>
            Hələ əməliyyat yoxdur. İlk xərci və ya gəliri əlavə edin.
          </AppText>
        }
      />
    </Entrance>
  ) : null;

  const main = data ? (
    <>
      {dashboard.isError ? <StaleNotice error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : null}
      <Entrance index={0}>
        <BalanceHero totalBalance={data.totalBalance} currencyCode={data.currencyCode} availableCurrencies={data.availableCurrencies} onCurrencyChange={setCurrency} otherCurrencies={data.otherCurrencies} negativeAccounts={data.negativeAccounts} />
      </Entrance>
      <Entrance index={1}>
        <SummaryCard data={data} />
      </Entrance>
      <Entrance index={2} style={styles.actions}>
        {quickActionDefinitions.map((action) => (
          <QuickAction key={action.kind} action={action} onPress={onQuickAdd} />
        ))}
      </Entrance>
      {!wide ? (
        <Entrance index={3}>
          <BudgetBlock data={data} pace={pace} layout="compact" onCreate={() => router.push('/finance/budgets/new')} />
        </Entrance>
      ) : null}
      {recent}
      {!wide ? <Entrance index={5}>{insight}</Entrance> : null}
    </>
  ) : null;

  const side = data ? (
    <>
      {wide ? (
        <Entrance index={2}>
          <BudgetBlock data={data} pace={pace} layout="full" onCreate={() => router.push('/finance/budgets/new')} />
        </Entrance>
      ) : null}
      {wide ? <Entrance index={3}>{insight}</Entrance> : null}
      <Entrance index={5} style={styles.section}>
        <SectionHeader title="Hesablar" actionTitle="İdarə et" onAction={() => router.push('/finance/accounts')} />
        <View>
          {data.accounts.map((account, index) => (
            <AccountItem
              key={account.accountId}
              account={{ id: account.accountId, name: account.name, type: account.type, currencyCode: account.currencyCode, balance: account.balance, isIncludedInTotal: account.isIncludedInTotal }}
              onPress={() => router.push(`/finance/accounts/${account.accountId}`)}
              isLast={index === data.accounts.length - 1}
            />
          ))}
        </View>
      </Entrance>
      <Entrance index={5} style={styles.section}>
        <SectionHeader title="Xərc kateqoriyaları" caption={data.expenseByCategory.length > 0 ? `${formatMonth(data.year, data.month)} · ${data.expenseByCategory.length} kateqoriya` : undefined} />
        <CategoryBreakdown items={data.expenseByCategory} currencyCode={data.currencyCode} animateOnMount />
      </Entrance>
      <Entrance index={5} style={styles.links}>
        <Button title="Köçürmələr" variant="soft" size="sm" icon="swap-horizontal-outline" onPress={() => router.push('/finance/transfers')} />
        <Button title="Büdcələr" variant="soft" size="sm" icon="pie-chart-outline" onPress={() => router.push('/finance/budgets')} />
        <Button title="Kateqoriyalar" variant="soft" size="sm" icon="pricetags-outline" onPress={() => router.push('/finance/categories')} />
        <Button title="Təkrarlananlar" variant="soft" size="sm" icon="repeat-outline" onPress={() => router.push('/finance/recurring')} testID="finance-link-recurring" />
        <Button title="Borclar" variant="soft" size="sm" icon="people-outline" onPress={() => router.push('/finance/debts')} testID="finance-link-debts" />
      </Entrance>
    </>
  ) : null;

  return (
    <Screen
      tabInset
      contentStyle={styles.page}
      refreshing={dashboard.isRefetching}
      onRefresh={() => {
        void accounts.refetch();
        void dashboard.refetch();
        void monthExpenses.refetch();
      }}>
      {header}

      {dashboard.isPending ? <DashboardSkeleton label="Dashboard yüklənir…" /> : null}
      {dashboard.isError && !data ? <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} /> : null}

      {data ? (
        wide ? (
          <View style={styles.columns}>
            <View style={[styles.column, styles.mainColumn]}>{main}</View>
            <View style={[styles.column, styles.sideColumn]}>{side}</View>
          </View>
        ) : (
          <>
            {main}
            {side}
          </>
        )
      ) : null}

      <QuickAddMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={onQuickAdd} origin="top-right" />
      <TransferGate visible={transferGate} onClose={() => setTransferGate(false)} onCreateAccount={() => router.push('/finance/accounts/new')} />
    </Screen>
  );
}

/** Income · Expense · Net on one white surface, with the daily average as a second line. */
function SummaryCard({ data }: { data: Dashboard }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <View style={styles.metrics}>
        <MetricItem label="Gəlir" amount={data.monthlyIncome} currencyCode={data.currencyCode} flow="Income" />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MetricItem label="Xərc" amount={data.monthlyExpense} currencyCode={data.currencyCode} flow="Expense" />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MetricItem label="Xalis axın" amount={data.monthlyNet} currencyCode={data.currencyCode} flow="Net" />
      </View>
      <View style={[styles.averageRow, { borderTopColor: colors.border }]}>
        <AppText variant="caption" color="textSecondary">
          Gündəlik orta xərc · {data.daysElapsed} gün
        </AppText>
        <AppText variant="meta">{formatAmount(data.dailyAverageExpense, data.currencyCode)}</AppText>
      </View>
      {data.debts && data.debts.monthlyPrincipalNet !== 0 ? (
        <View style={[styles.averageRow, { borderTopColor: colors.border }]} accessible accessibilityLabel={`Borc hərəkətləri: ${formatAmount(data.debts.monthlyPrincipalNet, data.currencyCode)}; nağd dəyişimi: ${formatAmount(data.debts.monthlyCashChange, data.currencyCode)}`} testID="dashboard-principal">
          <AppText variant="caption" color="textSecondary" style={styles.flex}>
            Borc hərəkətləri (gəlir/xərc deyil) · nağd dəyişimi {formatAmount(data.debts.monthlyCashChange, data.currencyCode)}
          </AppText>
          <MoneyText variant="meta" amount={data.debts.monthlyPrincipalNet} currencyCode={data.currencyCode} highlightNegative showCode={false} />
        </View>
      ) : null}
      {data.debts && (data.debts.receivablesOutstanding > 0 || data.debts.payablesOutstanding > 0) ? (
        <View style={[styles.debtRows, { borderTopColor: colors.border }]} accessible accessibilityLabel={`Alacaq ${formatAmount(data.debts.receivablesOutstanding, data.currencyCode)}, borc ${formatAmount(data.debts.payablesOutstanding, data.currencyCode)}, xalis mövqe ${formatAmount(data.debts.netPosition, data.currencyCode)}`} testID="dashboard-net-position">
          <AppText variant="caption" color="textSecondary">
            Alacaq {formatAmount(data.debts.receivablesOutstanding, data.currencyCode, false)} · Borc {formatAmount(data.debts.payablesOutstanding, data.currencyCode, false)}
            {data.debts.overdueCount > 0 ? ` · ${data.debts.overdueCount} gecikib` : ''}
          </AppText>
          <View style={styles.debtNetRow}>
            <AppText variant="caption" color="textMuted" style={styles.flex}>
              Xalis mövqe (nağd + alacaq − borc)
            </AppText>
            <MoneyText variant="meta" amount={data.debts.netPosition} currencyCode={data.currencyCode} highlightNegative showCode={false} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function BudgetBlock({ data, pace, layout, onCreate }: { data: Dashboard; pace: ReturnType<typeof budgetPace>; layout: 'full' | 'compact'; onCreate: () => void }) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      {data.overallBudget ? (
        <BudgetProgress budget={data.overallBudget} currencyCode={data.currencyCode} title="Ümumi büdcə" layout={layout} pace={pace} animateOnMount />
      ) : (
        <View style={styles.budgetEmpty}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Bu ay üçün büdcə yoxdur</AppText>
            <AppText variant="caption" color="textSecondary">
              Aylıq limit təyin edin ki, xərc tempi izlənsin.
            </AppText>
          </View>
          <Button title="Büdcə yarat" variant="soft" size="sm" onPress={onCreate} />
        </View>
      )}
    </View>
  );
}

/** Explains the missing prerequisite instead of a dead action. */
function TransferGate({ visible, onClose, onCreateAccount }: { visible: boolean; onClose: () => void; onCreateAccount: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Köçürmə üçün iki hesab lazımdır" presentation="dialog" scrollable={false} maxWidth={420}>
      <View style={styles.gate}>
        <AppText color="textSecondary">Köçürmə hesablar arasında aparılır. İkinci hesabı (məsələn, bank kartı və ya yığım) yaradın, sonra köçürmə edə bilərsiniz.</AppText>
        <Button
          title="Hesab yarat"
          icon="add"
          onPress={() => {
            onClose();
            onCreateAccount();
          }}
        />
      </View>
    </Sheet>
  );
}

/** Loading layout with the same geometry as the loaded dashboard: hero, summary, action row, budget, rows. */
function DashboardSkeleton({ label }: { label: string }) {
  return (
    <View style={styles.skeleton} accessibilityLiveRegion="polite" accessibilityLabel={label}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <Skeleton height={148} radius={Radius.xl} />
      <Skeleton height={92} radius={Radius.lg} />
      <View style={styles.skeletonRow}>
        <Skeleton height={52} radius={Radius.md} style={styles.flex} />
        <Skeleton height={52} radius={Radius.md} style={styles.flex} />
        <Skeleton height={52} radius={Radius.md} style={styles.flex} />
      </View>
      <Skeleton height={88} radius={Radius.lg} />
      <Skeleton width={150} height={18} />
      <Skeleton height={58} radius={Radius.md} />
      <Skeleton height={58} radius={Radius.md} />
      <Skeleton height={58} radius={Radius.md} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  page: {
    gap: Spacing.xl,
  },
  columns: {
    flexDirection: 'row',
    gap: Spacing.xxxl,
    alignItems: 'flex-start',
  },
  column: {
    gap: Spacing.xl,
  },
  mainColumn: {
    flex: 3,
    minWidth: 0,
  },
  sideColumn: {
    flex: 2,
    minWidth: 0,
  },
  section: {
    gap: Spacing.sm,
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  metrics: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.md,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  averageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  debtRows: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.sm,
    gap: 2,
  },
  debtNetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  budgetEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyLine: {
    paddingVertical: Spacing.sm,
  },
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gate: {
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.lg,
  },
  skeleton: {
    gap: Spacing.lg,
    maxWidth: 640,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
});
