import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnimatedNumber } from '@/components/animated-number';
import { ProgressTrack } from '@/components/budget-progress';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NutritionGoal, NutritionTotals } from '@/lib/api/nutrition';
import { energyDifferenceLabel, formatGrams, formatKcal, gramsDifferenceLabel, targetProgress, type TargetProgress } from '@/lib/nutrition';

type NutritionSummaryProps = {
  totals: NutritionTotals;
  goal: NutritionGoal | null;
  /** Eyebrow above the energy figure, e.g. "Bu gün" or the date of a past day. */
  label: string;
  /** Opens the goals screen; also the action offered when nothing is configured. */
  onConfigureGoal?: () => void;
  /** Sweeps the bars from zero on first render (diary reveal). */
  animateOnMount?: boolean;
};

/**
 * The day's energy and macros in one compact card: one line of energy with optional target progress, then the
 * three macros side by side. Deliberately short so the meal groups start inside the first viewport on a phone.
 * With no target configured it shows what was consumed plus an action to set one — never a made-up percentage.
 */
export function NutritionSummary({ totals, goal, label, onConfigureGoal, animateOnMount = false }: NutritionSummaryProps) {
  const { colors, shadows } = useTheme();
  const energy = targetProgress(totals.energyKcal, goal?.energyKcal);
  const macros = [
    { key: 'protein', label: 'Zülal', value: totals.proteinGrams, progress: targetProgress(totals.proteinGrams, goal?.proteinGrams), color: colors.moduleNutrition },
    { key: 'carbs', label: 'Karbohidrat', value: totals.carbGrams, progress: targetProgress(totals.carbGrams, goal?.carbGrams), color: colors.transfer },
    { key: 'fat', label: 'Yağ', value: totals.fatGrams, progress: targetProgress(totals.fatGrams, goal?.fatGrams), color: colors.warning },
  ] as const;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]} testID="nutrition-summary">
      <View style={styles.energyRow}>
        <View style={styles.energyText}>
          <AppText variant="meta" color="textSecondary">
            {label}
          </AppText>
          <View style={styles.energyValue}>
            <AnimatedNumber value={totals.energyKcal} currencyCode="" variant="title" showCode={false} fractionDigits={0} accessibilityLabel={`Ümumi enerji ${formatKcal(totals.energyKcal)}`} />
            <AppText variant="subheading" color="textSecondary">
              kkal
            </AppText>
          </View>
        </View>
        {energy ? (
          <View style={styles.energyTarget}>
            <AppText variant="meta" color={energy.over ? 'warningText' : 'textSecondary'} align="right">
              {energyDifferenceLabel(energy)}
            </AppText>
            <AppText variant="caption" color="textMuted" align="right">
              hədəf {formatKcal(energy.target, false)}
            </AppText>
          </View>
        ) : onConfigureGoal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hədəf təyin et"
            accessibilityHint="Kalori və makro hədəflərini açır"
            onPress={onConfigureGoal}
            hitSlop={8}
            testID="nutrition-set-goal"
            style={({ pressed }) => [styles.goalAction, { backgroundColor: pressed ? colors.surfaceInteractive : colors.primarySoft }]}>
            <Ionicons name="flag-outline" size={14} color={colors.primaryText} />
            <AppText variant="caption" color="primaryText">
              Hədəf təyin et
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {energy ? (
        <ProgressTrack
          percent={energy.percent}
          color={energy.over ? colors.warning : colors.moduleNutrition}
          label={`Kalori hədəfi: ${formatKcal(totals.energyKcal)} / ${formatKcal(energy.target)}`}
          height={6}
          animateOnMount={animateOnMount}
        />
      ) : null}

      <View style={[styles.macros, { borderTopColor: colors.border }]}>
        {macros.map((macro) => (
          <MacroColumn key={macro.key} label={macro.label} value={macro.value} progress={macro.progress} color={macro.color} animateOnMount={animateOnMount} />
        ))}
      </View>
    </View>
  );
}

function MacroColumn({ label, value, progress, color, animateOnMount }: { label: string; value: number; progress: TargetProgress | null; color: string; animateOnMount: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={progress ? `${label}: ${formatGrams(value)} / ${formatGrams(progress.target)}, ${gramsDifferenceLabel(progress)}` : `${label}: ${formatGrams(value)}, hədəf təyin edilməyib`}>
      <AppText variant="caption" color="textSecondary" numberOfLines={1}>
        {label}
      </AppText>
      <View style={styles.macroValue}>
        <AppText variant="bodyStrong" style={styles.tabular}>
          {formatGrams(value, false)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {progress ? `/ ${formatGrams(progress.target, false)} q` : 'q'}
        </AppText>
      </View>
      <ProgressTrack
        percent={progress?.percent ?? 0}
        color={progress ? (progress.over ? colors.warning : color) : colors.border}
        label={progress ? `${label} hədəfi` : `${label}: hədəf yoxdur`}
        height={4}
        animateOnMount={animateOnMount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    gap: Spacing.sm,
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  energyText: {
    flexShrink: 1,
    gap: Spacing.xxs,
  },
  energyValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  energyTarget: {
    alignItems: 'flex-end',
    gap: Spacing.xxs,
  },
  goalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: MinTouchTarget - 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
  },
  macros: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingTop: Spacing.md,
    marginTop: Spacing.xxs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  macro: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  macroValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
