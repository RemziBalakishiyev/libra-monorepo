import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { SectionHeader } from '@/components/section-header';
import { InlineError, Skeleton } from '@/components/states';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task, TaskDay } from '@/lib/api/tasks';
import { overdueLabel, taskAccessibilityLabel, whenLabel } from '@/lib/tasks';

const LIMIT = 3;

type HomeTaskListProps = {
  day: TaskDay | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Sets the completion state through the existing mutation; the row never guesses the outcome. */
  onToggle: (task: Task, completed: boolean) => void;
  /** The task whose completion request is in flight. */
  busyId: string | null;
  onOpenTask: (task: Task) => void;
  onOpenPlan: () => void;
  onCreate: () => void;
};

/**
 * The tasks that matter today, in this order: overdue ones from earlier days (with the day they were planned
 * for), then today's, pending before completed. At most three rows; the rest are one tap away in Plan.
 */
export function HomeTaskList({ day, loading, error, onRetry, onToggle, busyId, onOpenTask, onOpenPlan, onCreate }: HomeTaskListProps) {
  const { colors, shadows } = useTheme();
  const tasks = day ? pickTasks(day) : [];
  const total = day ? day.overdue.length + day.tasks.length : 0;
  const hidden = Math.max(0, total - tasks.length);

  return (
    <View style={styles.section} testID="home-tasks">
      <SectionHeader title="Bu günün tapşırıqları" actionTitle={day && total > 0 ? 'Plan' : undefined} onAction={day && total > 0 ? onOpenPlan : undefined} />
      {loading ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} accessibilityLabel="Tapşırıqlar yüklənir…" accessibilityLiveRegion="polite">
          {[0, 1].map((index) => (
            <View key={index} style={styles.bone}>
              <Skeleton width={22} height={22} radius={Radius.xs} />
              <Skeleton width="60%" height={14} />
            </View>
          ))}
        </View>
      ) : error && !day ? (
        <InlineError error={error} onRetry={onRetry} />
      ) : tasks.length === 0 ? (
        <View style={[styles.card, styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="home-tasks-empty">
          <AppText color="textSecondary" style={styles.flex}>
            Bu gün üçün tapşırıq yoxdur.
          </AppText>
          <Button title="Tapşırıq yarat" variant="soft" size="sm" icon="add" onPress={onCreate} testID="home-tasks-create" />
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, boxShadow: shadows.card }]}>
          {tasks.map((task, index) => (
            <HomeTaskRow key={task.id} task={task} overdue={day ? day.overdue.some((item) => item.id === task.id) : false} today={day?.date} separator={index > 0} busy={busyId === task.id} onToggle={onToggle} onOpen={onOpenTask} />
          ))}
          {hidden > 0 ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={`Daha ${hidden} tapşırıq, Planı açır`} onPress={onOpenPlan} scaleTo={0.99} containerStyle={styles.full} pressedStyle={{ backgroundColor: colors.surfaceSubtle }} style={[styles.more, { borderTopColor: colors.border }]}>
              <AppText variant="meta" color="primaryText">
                Daha {hidden} tapşırıq
              </AppText>
              <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
            </PressableScale>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** Overdue first, then today's pending, then today's completed; capped. */
export function pickTasks(day: TaskDay): Task[] {
  const todays = [...day.tasks].sort((a, b) => Number(a.isCompleted) - Number(b.isCompleted));
  return [...day.overdue, ...todays].slice(0, LIMIT);
}

function HomeTaskRow({ task, overdue, today, separator, busy, onToggle, onOpen }: { task: Task; overdue: boolean; today: string | undefined; separator: boolean; busy: boolean; onToggle: (task: Task, completed: boolean) => void; onOpen: (task: Task) => void }) {
  const { colors } = useTheme();
  const when = overdue ? overdueLabel(task) : whenLabel(task, today);

  return (
    <View style={[styles.row, separator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]} testID={`home-task-${task.id}`}>
      <PressableScale
        accessibilityRole="checkbox"
        aria-checked={task.isCompleted}
        aria-disabled={busy}
        accessibilityLabel={task.isCompleted ? `${task.title}: tamamlanıb` : `${task.title}: tamamlanmayıb`}
        accessibilityHint={task.isCompleted ? 'Tapşırığı yenidən açır' : 'Tapşırığı tamamlanmış kimi işarələyir'}
        disabled={busy}
        dimWhenDisabled={false}
        onPress={() => onToggle(task, !task.isCompleted)}
        scaleTo={0.9}
        containerStyle={styles.checkSlot}
        style={styles.checkTarget}
        testID={`home-task-toggle-${task.id}`}>
        <View style={[styles.checkbox, task.isCompleted ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: task.isOverdue ? colors.warningText : colors.borderStrong }]}>
          {task.isCompleted ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
        </View>
      </PressableScale>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={taskAccessibilityLabel(task, today)}
        accessibilityHint="Tapşırığı açır"
        onPress={() => onOpen(task)}
        scaleTo={0.995}
        containerStyle={styles.bodySlot}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={styles.body}
        testID={`home-task-open-${task.id}`}>
        <AppText variant="bodyStrong" numberOfLines={2} color={task.isCompleted ? 'textMuted' : 'textPrimary'} style={task.isCompleted ? styles.done : undefined}>
          {task.title}
        </AppText>
        <AppText variant="caption" color={task.isOverdue ? 'warningText' : 'textMuted'} numberOfLines={1}>
          {when}
          {task.seriesId ? ' · Təkrarlanan' : ''}
        </AppText>
      </PressableScale>
    </View>
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
  section: {
    gap: Spacing.md,
  },
  card: {
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  bone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minHeight: MinTouchTarget + 4,
    paddingHorizontal: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MinTouchTarget + 6,
  },
  checkSlot: {
    width: MinTouchTarget,
    minHeight: MinTouchTarget,
  },
  checkTarget: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.xs,
    borderCurve: 'continuous',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodySlot: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
    gap: 1,
  },
  done: {
    textDecorationLine: 'line-through',
  },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MinTouchTarget - 4,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
