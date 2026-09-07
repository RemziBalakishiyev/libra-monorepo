import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { BudgetProgress, budgetHealth } from '@/components/budget-progress';
import { Button, IconButton } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { ScreenHeader } from '@/components/screen-header';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { AppText, formatAmount, spokenMoney } from '@/components/text';
import { categoryColor, categoryVisual, type IconName } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useBudgets } from '@/hooks/use-finance';
import { useTheme } from '@/hooks/use-theme';
import type { Budget } from '@/lib/api/finance';
import { withAlpha } from '@/lib/color';
import { currentYearMonth, daysInMonth, formatMonth } from '@/lib/dates';
import { budgetPace } from '@/lib/finance-insights';

const OVERALL_LABEL = 'Ümumi büdcə';

interface Period {
  year: number;
  month: number;
}

function shiftPeriod(period: Period, delta: number): Period {
  const index = period.year * 12 + (period.month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** "3 büdcə · 1 aşılıb · 1 limitə yaxın" — one line that answers the month at a glance. */
function summarize(budgets: Budget[]): string {
  const over = budgets.filter((budget) => budgetHealth(budget) === 'over').length;
  const warning = budgets.filter((budget) => budgetHealth(budget) === 'warning').length;
  const parts = [`${budgets.length} büdcə`];
  if (over > 0) {
    parts.push(`${over} aşılıb`);
  }
  if (warning > 0) {
    parts.push(`${warning} limitə yaxın`);
  }
  return parts.join(' · ');
}

/** Two columns on desktop: an odd count gets a spacer so the last block keeps its width. */
type Cell = Budget | null;

export function BudgetsListScreen() {
  const router = useRouter();
  const { colors, layout } = useTheme();
  const [today] = useState(() => ({ ...currentYearMonth(), day: new Date().getDate() }));
  const [period, setPeriod] = useState<Period>(today);
  const budgets = useBudgets({ year: period.year, month: period.month });
  const columns = layout === 'wide' ? 2 : 1;
  const isCurrentMonth = period.year === today.year && period.month === today.month;
  const monthLabel = formatMonth(period.year, period.month);

  const data = budgets.data ?? [];
  const cells: Cell[] = columns === 2 && data.length % 2 === 1 ? [...data, null] : data;

  const openNew = () => router.push('/finance/budgets/new');

  return (
    <Screen scroll={false}>
      <ScreenHeader title="Büdcələr" size="compact" back trailing={<IconButton icon="add" accessibilityLabel="Yeni büdcə" accessibilityHint="Yeni büdcə formasını açır" variant="primary" onPress={openNew} />} />

      <View style={styles.toolbar}>
        <View style={styles.periodRow}>
          <IconButton icon="chevron-back" accessibilityLabel="Əvvəlki ay" variant="filled" onPress={() => setPeriod((current) => shiftPeriod(current, -1))} />
          <AppText variant="subheading" align="center" style={styles.periodLabel} accessibilityLiveRegion="polite" accessibilityLabel={`Dövr: ${monthLabel}`}>
            {monthLabel}
          </AppText>
          <IconButton icon="chevron-forward" accessibilityLabel="Növbəti ay" variant="filled" onPress={() => setPeriod((current) => shiftPeriod(current, 1))} />
        </View>
        {!isCurrentMonth ? (
          <View style={styles.todayRow}>
            <Button title="Bu aya qayıt" variant="ghost" size="sm" icon="today-outline" onPress={() => setPeriod(today)} />
          </View>
        ) : null}
      </View>

      {budgets.isPending ? <ListSkeleton rows={4} /> : null}
      {budgets.isError ? <ErrorState error={budgets.error} onRetry={() => void budgets.refetch()} /> : null}
      {budgets.isSuccess ? (
        <FlatList
          key={columns}
          data={cells}
          numColumns={columns}
          keyExtractor={(cell, index) => cell?.id ?? `spacer-${index}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={columns === 2 ? styles.columnRow : undefined}
          ItemSeparatorComponent={Separator}
          refreshControl={<RefreshControl refreshing={budgets.isRefetching} onRefresh={() => void budgets.refetch()} tintColor={colors.primary} colors={[colors.primary]} />}
          ListHeaderComponent={
            data.length > 0 ? (
              <AppText variant="caption" color="textMuted" style={styles.summary}>
                {summarize(data)}
              </AppText>
            ) : null
          }
          ListEmptyComponent={<EmptyState icon="pie-chart-outline" title="Bu ay üçün büdcə yoxdur" message="Ümumi və ya kateqoriya üzrə xərc büdcəsi yaradın." actionTitle="Büdcə yarat" onAction={openNew} />}
          renderItem={({ item, index }) =>
            item ? (
              <Entrance index={index} style={styles.slot}>
                <BudgetBlock budget={item} elapsedDays={isCurrentMonth ? today.day : null} onPress={() => router.push(`/finance/budgets/${item.id}`)} />
              </Entrance>
            ) : (
              <View style={styles.slot} />
            )
          }
        />
      ) : null}
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

/** One budget on a white surface: scope icon, then BudgetProgress with status, bar, and figures. */
function BudgetBlock({ budget, elapsedDays, onPress }: { budget: Budget; elapsedDays: number | null; onPress: () => void }) {
  const { colors, scheme, shadows } = useTheme();
  const title = budget.categoryName ?? OVERALL_LABEL;
  const icon: IconName = budget.categoryName ? categoryVisual(budget.categoryName, 'Expense').icon : 'pie-chart-outline';
  const tint = budget.categoryName ? categoryColor(budget.categoryName, scheme, 'Expense') : colors.primary;
  const remaining = budget.isOverBudget ? `aşım ${formatAmount(-budget.remainingAmount, budget.currencyCode)}` : `qalıq ${formatAmount(budget.remainingAmount, budget.currencyCode)}`;
  const label = `${title}, ${spokenMoney(budget.usedAmount, budget.currencyCode)} / ${formatAmount(budget.amount, budget.currencyCode)}, ${remaining}`;
  const pace = elapsedDays !== null ? budgetPace(budget.usagePercent, elapsedDays, daysInMonth(budget.year, budget.month)) : null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Büdcəni açır"
      onPress={onPress}
      scaleTo={0.985}
      containerStyle={styles.full}
      pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
      style={[styles.block, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <View style={[styles.iconTile, { backgroundColor: withAlpha(tint, scheme === 'dark' ? 0.18 : 0.12) }]}>
        <Ionicons name={icon} size={20} color={tint} />
      </View>
      <View style={styles.blockBody}>
        <BudgetProgress budget={budget} currencyCode={budget.currencyCode} title={title} layout="full" pace={pace} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  full: {
    width: '100%',
  },
  toolbar: {
    gap: Spacing.sm,
  },
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  periodLabel: {
    flex: 1,
  },
  todayRow: {
    alignItems: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xxl,
  },
  columnRow: {
    gap: Spacing.lg,
  },
  summary: {
    paddingBottom: Spacing.md,
  },
  separator: {
    height: Spacing.md,
  },
  slot: {
    flex: 1,
    minWidth: 0,
  },
  block: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockBody: {
    flex: 1,
    minWidth: 0,
  },
});
