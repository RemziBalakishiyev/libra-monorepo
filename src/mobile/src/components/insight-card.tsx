import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from '@/components/button';
import { Entrance } from '@/components/entrance';
import { SpendingBars } from '@/components/spending-bars';
import { Skeleton } from '@/components/states';
import { AppText, formatAmount } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDayLong, formatDayShort, formatMonth } from '@/lib/dates';
import { budgetPace, recentDays } from '@/lib/finance-insights';
import { formatNumber } from '@/lib/money';
import { useMotion } from '@/lib/motion';

export interface InsightInput {
  currencyCode: string;
  year: number;
  month: number;
  monthlyExpense: number;
  dailyAverageExpense: number;
  daysElapsed: number;
  daysInMonth: number;
  /** Complete daily series (index 0 = day 1), or null while it is loading / unavailable. */
  dailyExpenses: number[] | null;
  budget: { amount: number; usedAmount: number; usagePercent: number } | null;
  topCategory: { categoryName: string; percent: number } | null;
}

export interface Insight {
  icon: IconName;
  text: string;
  /** `limit` = budget usage, `pace` = calendar comparison, `estimate` = labelled projection, `share` = category. */
  kind: 'limit' | 'pace' | 'estimate' | 'share';
}

/**
 * Deterministic insights from the numbers on screen, in priority order. Budget usage (a fact) and spending pace
 * (a comparison with the calendar) are separate sentences; the month-end figure is explicitly an estimate.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const { currencyCode, daysElapsed, daysInMonth } = input;
  const remainingDays = Math.max(daysInMonth - daysElapsed, 0);

  if (input.budget && input.budget.amount > 0) {
    insights.push({
      kind: 'limit',
      icon: 'pie-chart-outline',
      text: `Büdcənin ${Math.round(input.budget.usagePercent)}%-i istifadə olunub: ${formatAmount(input.budget.usedAmount, currencyCode, false)} / ${formatAmount(input.budget.amount, currencyCode)}.`,
    });
    const pace = budgetPace(input.budget.usagePercent, daysElapsed, daysInMonth);
    if (pace) {
      insights.push({
        kind: 'pace',
        icon: 'speedometer-outline',
        text: pace.fast
          ? `Temp: ayın ${Math.round(pace.expectedPercent)}%-i keçib, xərc isə büdcənin ${Math.round(input.budget.usagePercent)}%-inə çatıb — təqvimdən ${Math.round(pace.aheadByPercent)} bənd öndə.`
          : `Temp: ayın ${Math.round(pace.expectedPercent)}%-i keçib, xərc büdcənin ${Math.round(input.budget.usagePercent)}%-idir — təqvimlə uyğundur.`,
      });
    }
  } else if (input.topCategory) {
    insights.push({ kind: 'share', icon: 'pie-chart-outline', text: `${input.topCategory.categoryName} bu ayın xərclərinin ${Math.round(input.topCategory.percent)}%-ni təşkil edir.` });
  }

  if (daysElapsed > 0 && remainingDays > 0) {
    insights.push({ kind: 'estimate', icon: 'calendar-outline', text: `Bu orta davam etsə, ay sonu xərc təxminən ${formatAmount(projectMonthEnd(input.monthlyExpense, daysElapsed, daysInMonth), currencyCode)} olar.` });
  }

  if (input.budget && input.topCategory) {
    insights.push({ kind: 'share', icon: 'pricetags-outline', text: `Ən böyük kateqoriya: ${input.topCategory.categoryName}, xərclərin ${Math.round(input.topCategory.percent)}%-i.` });
  }

  return insights;
}

/**
 * Month-end projection at the current average: monthly expense × month length ÷ elapsed days, computed from the
 * unrounded monthly total in cents and rounded once at the end (never from the displayed two-decimal average).
 */
export function projectMonthEnd(monthlyExpense: number, daysElapsed: number, daysInMonth: number): number {
  if (daysElapsed <= 0) {
    return monthlyExpense;
  }
  return Math.round((Math.round(monthlyExpense * 100) * daysInMonth) / daysElapsed) / 100;
}

/** Compact number for a tiny column label; the exact value lives in the accessibility label. */
export function compactAmount(value: number): string {
  if (value >= 100) {
    return formatNumber(Math.round(value), 0);
  }
  return formatNumber(value, value % 1 === 0 ? 0 : 1);
}

type InsightCardProps = {
  input: InsightInput;
  /** Daily series state: complete, still loading, or failed (totals above stay valid). */
  seriesStatus: 'ready' | 'loading' | 'unavailable';
  onRetrySeries?: () => void;
  animateOnMount?: boolean;
};

/**
 * "Gündəlik xərc": the last seven days with real dates and values, one or two deterministic sentences, and a
 * "Tam ay" expander for the whole-month strip. Period and currency are always stated.
 */
export function InsightCard({ input, seriesStatus, onRetrySeries, animateOnMount = false }: InsightCardProps) {
  const { colors, shadows } = useTheme();
  const motion = useMotion();
  const [expanded, setExpanded] = useState(false);
  const insights = buildInsights(input);
  const days = input.dailyExpenses ? recentDays(input.dailyExpenses, input.daysElapsed, 7) : [];
  const peak = Math.max(...days.map((day) => day.amount), 0);
  // Limit usage and pace are both shown collapsed; the estimate and category share sit behind the expander.
  const visibleCount = insights[1]?.kind === 'pace' ? 2 : 1;
  const visible = insights.slice(0, visibleCount);
  const details = insights.slice(visibleCount);

  return (
    <Animated.View layout={motion.layout()} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <AppText variant="subheading">Gündəlik xərc</AppText>
          <AppText variant="caption" color="textMuted">
            {formatMonth(input.year, input.month)} · {input.currencyCode} · son {days.length > 0 ? days.length : 7} gün
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted">
          {input.daysElapsed} / {input.daysInMonth} gün
        </AppText>
      </View>

      {seriesStatus === 'loading' ? (
        <View style={styles.daysRow} accessibilityLiveRegion="polite" accessibilityLabel="Gündəlik bölgü yüklənir…">
          {Array.from({ length: 7 }, (_, index) => (
            <View key={index} style={styles.dayColumn}>
              <Skeleton width="70%" height={36} radius={4} />
              <Skeleton width="60%" height={10} />
            </View>
          ))}
        </View>
      ) : null}

      {seriesStatus === 'unavailable' ? (
        <View style={[styles.unavailable, { backgroundColor: colors.surfaceSubtle }]} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={18} color={colors.textSecondary} />
          <AppText variant="meta" color="textSecondary" style={styles.flex}>
            Gündəlik bölgü əlçatan deyil: bütün əməliyyatlar yüklənmədi. Aylıq cəmlər dəqiqdir.
          </AppText>
          {onRetrySeries ? <Button title="Yenidən" variant="ghost" size="sm" onPress={onRetrySeries} /> : null}
        </View>
      ) : null}

      {seriesStatus === 'ready' && days.length > 0 ? (
        <View style={styles.daysRow} accessibilityRole="list">
          {days.map((day) => {
            const ratio = peak > 0 ? day.amount / peak : 0;
            return (
              <View key={day.day} style={styles.dayColumn} accessible accessibilityLabel={`${formatDayLong(input.year, input.month, day.day)}: ${formatAmount(day.amount, input.currencyCode)}`}>
                <AppText variant="caption" color={day.isToday ? 'textPrimary' : 'textSecondary'} numberOfLines={1} style={styles.tabular}>
                  {compactAmount(day.amount)}
                </AppText>
                <View style={[styles.dayTrack, { backgroundColor: colors.surfaceInteractive }]}>
                  <View style={[styles.dayFill, { height: Math.max(day.amount > 0 ? 4 : 0, ratio * DAY_BAR_HEIGHT), backgroundColor: day.isToday ? colors.primary : colors.expense }]} />
                </View>
                <AppText variant="caption" color={day.isToday ? 'primaryText' : 'textMuted'} numberOfLines={1}>
                  {day.isToday ? 'Bu gün' : formatDayShort(input.year, input.month, day.day)}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {visible.length > 0 ? (
        <View style={styles.sentences}>
          {visible.map((insight, index) => (
            <Sentence key={insight.text} insight={insight} strong={index === 0} />
          ))}
          {expanded ? details.map((insight) => <Sentence key={insight.text} insight={insight} />) : null}
        </View>
      ) : null}

      {expanded && seriesStatus === 'ready' && input.dailyExpenses ? (
        <Entrance from="fade" style={styles.fullMonth}>
          <AppText variant="caption" color="textMuted">
            Tam ay · {formatMonth(input.year, input.month)} · gələcək günlər boşdur
          </AppText>
          <SpendingBars dailyExpenses={input.dailyExpenses} daysElapsed={input.daysElapsed} currencyCode={input.currencyCode} year={input.year} month={input.month} height={56} referenceValue={input.budget && input.budget.amount > 0 ? input.budget.amount / input.daysInMonth : undefined} referenceLabel="Gündəlik büdcə payı" animateOnMount={animateOnMount} />
        </Entrance>
      ) : null}

      {details.length > 0 || (seriesStatus === 'ready' && input.dailyExpenses) ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={expanded ? 'Daha az' : 'Tam ay və ətraflı'} onPress={() => setExpanded((value) => !value)} hitSlop={8} style={styles.toggle}>
          <AppText variant="meta" color="primaryText">
            {expanded ? 'Daha az' : 'Tam ay və ətraflı'}
          </AppText>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primaryText} />
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function Sentence({ insight, strong = false }: { insight: Insight; strong?: boolean }) {
  const { colors } = useTheme();
  const tone = insight.kind === 'pace' ? colors.warningText : insight.kind === 'estimate' ? colors.textMuted : colors.primaryText;
  return (
    <View style={styles.sentence}>
      <Ionicons name={insight.icon} size={16} color={tone} />
      <AppText variant={strong ? 'meta' : 'caption'} color={strong ? 'textPrimary' : 'textSecondary'} style={styles.flex}>
        {insight.text}
      </AppText>
    </View>
  );
}

const DAY_BAR_HEIGHT = 40;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  daysRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  dayTrack: {
    width: '100%',
    height: DAY_BAR_HEIGHT,
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  dayFill: {
    width: '100%',
    borderRadius: 4,
  },
  unavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
  },
  sentences: {
    gap: Spacing.sm,
  },
  sentence: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  fullMonth: {
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxs,
    alignSelf: 'flex-start',
    minHeight: 32,
  },
});
