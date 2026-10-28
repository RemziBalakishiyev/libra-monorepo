import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ProgressTrack } from '@/components/budget-progress';
import { Button } from '@/components/button';
import { AppText } from '@/components/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TaskCounts } from '@/lib/api/tasks';
import { dayProgress, overdueNote, progressDetail, remainingLabel } from '@/lib/tasks';

type DaySummaryProps = {
  counts: TaskCounts;
  /** Offered only when the day is genuinely empty, so the surface stays a summary the rest of the time. */
  onAdd: () => void;
  animateOnMount?: boolean;
};

/**
 * Today's progress on one compact surface.
 *
 * It leads with the number of tasks still open — the figure a person actually wants — and keeps
 * "c / n tamamlanıb" as quiet support beneath it. The same number is never repeated as a percentage as well:
 * the share is drawn once, as a thin track, and only when there is something for it to be a share of.
 *
 * Overdue work is reported on its own line, never folded into today's figures, and the "everything done"
 * wording is scoped to today: finishing today's tasks says nothing about what is still owed from before.
 */
export function DaySummary({ counts, onAdd, animateOnMount = false }: DaySummaryProps) {
  const { colors } = useTheme();
  const progress = dayProgress(counts);
  const note = overdueNote(progress);
  const done = progress.state === 'done';
  const empty = progress.state === 'empty';
  const spoken = [remainingLabel(progress), progressDetail(progress), note].filter(Boolean).join(', ');

  return (
    <View
      style={[styles.card, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={spoken}
      testID="task-summary">
      <View style={styles.head}>
        <View style={styles.text}>
          <AppText variant="title" color={done ? 'primaryText' : 'textPrimary'} testID="task-summary-remaining">
            {remainingLabel(progress)}
          </AppText>
          <AppText variant="caption" color="textSecondary" testID="task-summary-detail">
            {progressDetail(progress)}
          </AppText>
        </View>
        {done ? <Ionicons name="checkmark-circle" size={26} color={colors.primaryText} /> : null}
      </View>

      {/* Drawn only when today actually holds tasks: a track for an empty day would be a fabricated zero. */}
      {progress.percent !== null ? (
        <ProgressTrack
          percent={progress.percent}
          color={colors.modulePlan}
          // A groove slightly darker than the card: an empty track must not read as a full white bar.
          trackColor={colors.border}
          label={`Bu gün: ${progress.completed} / ${progress.scheduled} tamamlanıb`}
          height={6}
          animateOnMount={animateOnMount}
        />
      ) : null}

      {note ? (
        <View style={styles.overdue}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.warningText} />
          <AppText variant="caption" color="warningText" testID="task-summary-overdue">
            {note}
          </AppText>
        </View>
      ) : null}

      {empty ? <Button title="Tapşırıq əlavə et" variant="soft" size="sm" icon="add" onPress={onAdd} testID="task-summary-add" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  overdue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
