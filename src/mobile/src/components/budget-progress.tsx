import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppText, MoneyText, formatAmount } from '@/components/text';
import type { IconName } from '@/constants/categories';
import { Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BudgetPace } from '@/lib/finance-insights';

type ProgressTrackProps = {
  percent: number;
  color: string;
  label: string;
  height?: number;
  trackColor?: string;
  /** Sweep from 0 on first render (dashboard reveal); otherwise start at the value and animate only changes. */
  animateOnMount?: boolean;
  /** Optional marker on the track (e.g. the elapsed share of the month). */
  marker?: number;
  markerColor?: string;
};

/**
 * Animated fill. The fill is absolutely positioned with no children, so animating its width is the one
 * sanctioned layout animation: nothing else re-lays-out and the corner radius survives.
 */
export function ProgressTrack({ percent, color, label, height = 8, trackColor, animateOnMount = false, marker, markerColor }: ProgressTrackProps) {
  const { colors, reducedMotion } = useTheme();
  const clamped = Math.max(0, Math.min(100, percent));
  const width = useSharedValue(reducedMotion || !animateOnMount ? clamped : 0);

  useEffect(() => {
    width.set(withTiming(clamped, { duration: reducedMotion ? 0 : Motion.data, easing: Motion.easeOut }));
  }, [clamped, reducedMotion, width]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.get()}%` }));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor ?? colors.surfaceInteractive }]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: `${Math.round(clamped)}%` }}>
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height / 2 }, fillStyle]} />
      {marker !== undefined ? <View style={[styles.marker, { left: `${Math.max(0, Math.min(100, marker))}%`, backgroundColor: markerColor ?? colors.textMuted }]} /> : null}
    </View>
  );
}

export interface BudgetSummaryData {
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  usagePercent: number;
  isOverBudget: boolean;
}

export type BudgetHealth = 'none' | 'healthy' | 'warning' | 'over';

/** Limit status: how much of the budget is used, regardless of the calendar. */
export function budgetHealth(budget: BudgetSummaryData | null | undefined): BudgetHealth {
  if (!budget) {
    return 'none';
  }
  if (budget.isOverBudget) {
    return 'over';
  }
  return budget.usagePercent >= 80 ? 'warning' : 'healthy';
}

const healthCopy: Record<BudgetHealth, { label: string; icon: IconName }> = {
  none: { label: 'Büdcə yoxdur', icon: 'remove-circle-outline' },
  healthy: { label: 'Büdcə daxilində', icon: 'checkmark-circle' },
  warning: { label: 'Limitə yaxın', icon: 'alert-circle' },
  over: { label: 'Büdcə aşılıb', icon: 'warning' },
};

/** Fill colour for bars and icons (accent). */
export function useBudgetHealthColor(health: BudgetHealth): string {
  const { colors } = useTheme();
  return health === 'over' ? colors.expense : health === 'warning' ? colors.warning : health === 'healthy' ? colors.income : colors.textMuted;
}

/** Text colour for the status label (readable foreground). */
export function useBudgetHealthTextColor(health: BudgetHealth): string {
  const { colors } = useTheme();
  return health === 'over' ? colors.expenseText : health === 'warning' ? colors.warningText : health === 'healthy' ? colors.incomeText : colors.textMuted;
}

type BudgetProgressProps = {
  budget: BudgetSummaryData | null;
  currencyCode: string;
  title?: string;
  /** `full` = title, status, bar, figures, pace; `compact` = title, status, bar, one line. */
  layout?: 'full' | 'compact';
  animateOnMount?: boolean;
  /** Spending pace versus the elapsed month; shown as a comparison, separate from the limit status. */
  pace?: BudgetPace | null;
};

/** Answers "am I within my budget?" with a state label and icon, never colour alone. */
export function BudgetProgress({ budget, currencyCode, title = 'Aylıq büdcə', layout = 'full', animateOnMount = false, pace = null }: BudgetProgressProps) {
  const { colors } = useTheme();
  const health = budgetHealth(budget);
  const color = useBudgetHealthColor(health);
  const textColor = useBudgetHealthTextColor(health);
  const copy = healthCopy[health];

  if (!budget) {
    return (
      <View style={styles.block}>
        <View style={styles.headerRow}>
          <AppText variant="meta" color="textSecondary">
            {title}
          </AppText>
          <StatusChip icon={copy.icon} label={copy.label} color={colors.textMuted} />
        </View>
        <AppText variant="caption" color="textSecondary">
          Bu ay üçün ümumi büdcə təyin edilməyib.
        </AppText>
      </View>
    );
  }

  const remainingText = budget.isOverBudget ? `Aşım ${formatAmount(-budget.remainingAmount, currencyCode, false)}` : `Qalıq ${formatAmount(budget.remainingAmount, currencyCode, false)}`;

  return (
    <View style={styles.block}>
      <View style={styles.headerRow}>
        <AppText variant="meta" color="textSecondary" numberOfLines={2} style={styles.flex}>
          {title}
        </AppText>
        <StatusChip icon={copy.icon} label={copy.label} color={textColor} />
      </View>
      <ProgressTrack percent={budget.usagePercent} color={color} label={`${title} istifadəsi`} animateOnMount={animateOnMount} marker={pace ? pace.expectedPercent : undefined} markerColor={colors.textMuted} />
      <View style={styles.figures}>
        <View style={styles.figureRow}>
          <MoneyText variant="bodyStrong" amount={budget.usedAmount} currencyCode={currencyCode} showCode={false} />
          <AppText variant="caption" color="textMuted">
            {' '}/ {formatAmount(budget.amount, currencyCode)}
          </AppText>
        </View>
        <AppText variant="caption" color={budget.isOverBudget ? 'expenseText' : 'textSecondary'}>
          {remainingText}
          {` · ${Math.round(budget.usagePercent)}%`}
        </AppText>
      </View>
      {layout === 'full' && pace ? (
        <View style={styles.paceRow} accessible accessibilityLabel={paceLabel(pace, budget.usagePercent)}>
          <Ionicons name="speedometer-outline" size={14} color={pace.fast ? colors.warningText : colors.textMuted} />
          <AppText variant="caption" color={pace.fast ? 'warningText' : 'textSecondary'} style={styles.flex}>
            {paceLabel(pace, budget.usagePercent)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** Pace copy: a comparison with the calendar, never a promise about the month end. */
export function paceLabel(pace: BudgetPace, usagePercent: number): string {
  const elapsed = Math.round(pace.expectedPercent);
  const used = Math.round(usagePercent);
  if (pace.fast) {
    return `Temp: ayın ${elapsed}%-i keçib, büdcənin ${used}%-i xərclənib — təqvimdən sürətli.`;
  }
  return `Temp: ayın ${elapsed}%-i keçib, büdcənin ${used}%-i xərclənib.`;
}

function StatusChip({ icon, label, color }: { icon: IconName; label: string; color: string }) {
  return (
    <View style={styles.status} accessible accessibilityLabel={label}>
      <Ionicons name={icon} size={14} color={color} />
      <AppText variant="caption" style={{ color }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  marker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    opacity: 0.7,
  },
  block: {
    gap: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radius.sm,
  },
  figures: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  paceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
});
