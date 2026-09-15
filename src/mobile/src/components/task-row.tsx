import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/api/tasks';
import { overdueLabel, priorityIcon, priorityLabel, taskAccessibilityLabel, whenLabel } from '@/lib/tasks';

type TaskRowProps = {
  task: Task;
  /** Sets the completion state to the value the control moves to. Never a blind toggle. */
  onToggle: (task: Task, completed: boolean) => void;
  /** Opens the task for inspection and editing. */
  onPress: (task: Task) => void;
  /** Opens the overflow menu (edit, delete, and the series actions when there are any). */
  onMore: (task: Task) => void;
  /** True while this row's own completion request is in flight. */
  busy?: boolean;
  /** Shows the day it was planned for instead of a relative label — used in the overdue section. */
  showOverdueDate?: boolean;
  today?: string;
  showSeparator?: boolean;
};

/**
 * One task: a completion control, the title (which wraps rather than being cut), when it is due, its priority
 * and an overflow control.
 *
 * The completion control is a checkbox, so its state is announced once and the whole row stays a separate
 * button that opens the task. Priority is a small labelled chip with its own glyph — never colour alone.
 */
export function TaskRow({ task, onToggle, onPress, onMore, busy = false, showOverdueDate = false, today, showSeparator = false }: TaskRowProps) {
  const { colors } = useTheme();
  const when = showOverdueDate ? overdueLabel(task) : whenLabel(task, today);
  const late = task.isOverdue;

  return (
    <View style={[styles.wrapper, showSeparator ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]} testID={`task-row-${task.id}`}>
      <PressableScale
        accessibilityRole="checkbox"
        // `aria-checked` carries the state on both platforms: react-native-web ignores accessibilityState,
        // and React Native merges the aria prop back into it.
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
        testID={`task-toggle-${task.id}`}>
        <View
          style={[
            styles.checkbox,
            task.isCompleted
              ? { backgroundColor: colors.modulePlan, borderColor: colors.modulePlan }
              : { borderColor: late ? colors.warningText : colors.borderStrong },
          ]}>
          {task.isCompleted ? <Ionicons name="checkmark" size={16} color={colors.onHero} /> : null}
        </View>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={taskAccessibilityLabel(task, today)}
        accessibilityHint="Tapşırığı açır və düzəliş etməyə imkan verir"
        onPress={() => onPress(task)}
        scaleTo={0.995}
        containerStyle={styles.pressSlot}
        pressedStyle={{ backgroundColor: colors.surfaceSubtle }}
        style={styles.body}
        testID={`task-open-${task.id}`}>
        <View style={styles.text}>
          {/* The title wraps to three lines; a long task is readable rather than truncated to a stub. */}
          <AppText variant="bodyStrong" numberOfLines={3} color={task.isCompleted ? 'textMuted' : 'textPrimary'} style={task.isCompleted ? styles.done : undefined}>
            {task.title}
          </AppText>
          <View style={styles.metaRow}>
            <AppText variant="caption" color={late ? 'warningText' : 'textMuted'} numberOfLines={1}>
              {when}
            </AppText>
            {task.seriesId ? (
              <View style={styles.metaItem}>
                <Ionicons name="repeat-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted">
                  Təkrarlanan
                </AppText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.priority, { backgroundColor: colors.surfaceSubtle }]}>
          <Ionicons name={priorityIcon(task.priority)} size={13} color={colors.textSecondary} />
          <AppText variant="caption" color="textSecondary" numberOfLines={1}>
            {priorityLabel(task.priority)}
          </AppText>
        </View>
      </PressableScale>

      <IconButton
        icon="ellipsis-horizontal"
        accessibilityLabel={`${task.title} üçün əməliyyatlar`}
        accessibilityHint="Düzəliş və silmə seçimlərini açır"
        size={18}
        onPress={() => onMore(task)}
        testID={`task-more-${task.id}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingRight: Spacing.sm,
  },
  checkSlot: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
  },
  checkTarget: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: Radius.sm,
    borderCurve: 'continuous',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressSlot: {
    flex: 1,
    minWidth: 0,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.xs,
    borderRadius: Radius.md,
    minHeight: MinTouchTarget,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  done: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  priority: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
});
