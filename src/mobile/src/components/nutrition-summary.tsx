import { Ionicons } from '@expo/vector-icons';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';

import { ProgressTrack } from '@/components/budget-progress';
import { ProgressRing } from '@/components/progress-ring';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NutritionGoal, NutritionTotals } from '@/lib/api/nutrition';
import { energyDifferenceLabel, formatGrams, formatKcal, gramsDifferenceLabel, macroBreakdown, ringLabel, ringPercent, targetProgress, type TargetProgress } from '@/lib/nutrition';

type NutritionSummaryProps = {
  totals: NutritionTotals;
  goal: NutritionGoal | null;
  /** Eyebrow above the energy figure, e.g. "Bu gün" or the date of a past day. */
  label: string;
  /** How many entries the day holds: nothing recorded reads differently from a recorded zero. */
  entryCount: number;
  /** Opens the goals screen; also the action offered when nothing is configured. */
  onConfigureGoal?: () => void;
  /** Sweeps the bars and ring from zero on first render (diary reveal). */
  animateOnMount?: boolean;
};

/**
 * The day's energy and macros on one softly tinted surface: the consumed energy with its target and the
 * remaining (or exceeded) amount, a modest ring beside it, then the three macros as compact rows.
 *
 * Everything here is what was recorded. With no target the ring is absent and a "Hədəf təyin et" action takes
 * its place — never an invented default or a percentage of nothing. Exceeding a target is stated plainly
 * ("… artıq"), never celebrated as completion, and the arc is clamped while the real figure stays readable.
 */
export function NutritionSummary({ totals, goal, label, entryCount, onConfigureGoal, animateOnMount = false }: NutritionSummaryProps) {
  const { colors } = useTheme();
  const energy = targetProgress(totals.energyKcal, goal?.energyKcal);
  const macros = macroBreakdown(totals, goal);
  const empty = entryCount === 0;
  // The ring's centre and the macro rows stack under enlarged text instead of squeezing the figures.
  const stacked = PixelRatio.getFontScale() > 1.3;

  const energyColor = energy?.over ? colors.warningText : colors.primaryText;
  const spokenEnergy = energy
    ? `${label}: ${formatKcal(totals.energyKcal)}, hədəf ${formatKcal(energy.target)}, ${energyDifferenceLabel(energy)}`
    : `${label}: ${formatKcal(totals.energyKcal)}, hədəf təyin edilməyib`;

  return (
    <View style={[styles.card, { backgroundColor: colors.nutritionTint, borderColor: colors.nutritionTintBorder }]} testID="nutrition-summary">
      <View style={[styles.energyRow, stacked ? styles.energyRowStacked : null]}>
        <View style={styles.energyText}>
          <AppText variant="caption" color="textSecondary">
            {label}
          </AppText>
          <View style={styles.energyValue} accessible accessibilityLabel={spokenEnergy}>
            <AppText variant="hero" style={[styles.tabular, { color: colors.textPrimary }]} testID="nutrition-energy">
              {formatKcal(totals.energyKcal, false)}
            </AppText>
            <AppText variant="subheading" color="textSecondary">
              kkal
            </AppText>
          </View>
          {energy ? (
            <View style={styles.energyMeta}>
              <AppText variant="meta" style={{ color: energyColor }} testID="nutrition-energy-difference">
                {energyDifferenceLabel(energy)}
              </AppText>
              <AppText variant="caption" color="textMuted">
                hədəf {formatKcal(energy.target)}
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
              style={({ pressed }) => [styles.goalAction, { backgroundColor: pressed ? colors.surfaceInteractive : colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flag-outline" size={14} color={colors.primaryText} />
              <AppText variant="caption" color="primaryText">
                Hədəf təyin et
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {energy ? (
          <ProgressRing
            percent={ringPercent(energy)}
            color={energy.over ? colors.warning : colors.primary}
            trackColor={colors.nutritionTintBorder}
            accessibilityLabel={`Kalori hədəfi: ${formatKcal(totals.energyKcal)} / ${formatKcal(energy.target)}`}
            testID="nutrition-ring">
            <AppText variant="meta" style={[styles.tabular, { color: energyColor }]}>
              {ringLabel(energy)}
            </AppText>
          </ProgressRing>
        ) : null}
      </View>

      {empty ? (
        <AppText variant="caption" color="textMuted" testID="nutrition-empty-note">
          Sıfır — hələ heç nə qeyd olunmayıb.
        </AppText>
      ) : null}

      <View style={[styles.macros, { borderTopColor: colors.nutritionTintBorder }]}>
        {macros.map((macro) => (
          <MacroRow key={macro.key} label={macro.label} value={macro.value} progress={macro.progress} fill={colors[macro.fill]} text={colors[macro.text]} animateOnMount={animateOnMount} />
        ))}
      </View>
    </View>
  );
}

function MacroRow({ label, value, progress, fill, text, animateOnMount }: { label: string; value: number; progress: TargetProgress | null; fill: string; text: string; animateOnMount: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={styles.macro}
      accessible
      accessibilityLabel={progress ? `${label}: ${formatGrams(value)} / ${formatGrams(progress.target)}, ${gramsDifferenceLabel(progress)}` : `${label}: ${formatGrams(value)}, hədəf təyin edilməyib`}>
      <View style={styles.macroHead}>
        <View style={[styles.macroDot, { backgroundColor: fill }]} />
        <AppText variant="caption" color="textSecondary" numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
        <View style={styles.macroValue}>
          <AppText variant="bodyStrong" style={[styles.tabular, { color: text }]}>
            {formatGrams(value, false)}
          </AppText>
          {/* An untracked macro still shows its grams; only the "/ target" half disappears. */}
          <AppText variant="caption" color="textMuted">
            {progress ? `/ ${formatGrams(progress.target, false)} q` : 'q · hədəf yoxdur'}
          </AppText>
        </View>
      </View>
      <ProgressTrack
        percent={progress ? ringPercent(progress) : 0}
        color={progress ? (progress.over ? colors.warning : fill) : colors.nutritionTintBorder}
        trackColor={colors.nutritionTintBorder}
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
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  energyRowStacked: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  energyText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xxs,
  },
  energyValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  energyMeta: {
    gap: 1,
  },
  goalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    minHeight: MinTouchTarget - 12,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Spacing.xxs,
  },
  macros: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  macro: {
    gap: Spacing.xs,
  },
  macroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
