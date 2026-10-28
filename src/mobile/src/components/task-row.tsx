import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { IconButton } from '@/components/button';
import { PressableScale } from '@/components/pressable-scale';
import { AppText } from '@/components/text';
import { MinTouchTarget, Motion, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Task } from '@/lib/api/tasks';
import { hasTime, priorityIcon, priorityLabel, rowMeta, taskAccessibilityLabel, type RowContext } from '@/lib/tasks';

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
  /** Decides what the metadata line may leave out — the heading above already says the rest. */
  context?: RowContext;
  today?: string;
  showSeparator?: boolean;
};

/**
 * One task: a completion control, the title, when it is due, its priority and an overflow control.
 *
 * The title is the strongest thing in the row and wraps rather than being cut. The metadata line under it is
 * whatever the heading above has not already said — a clock, "Gün ərzində", or the day an overdue task was
 * actually planned for. Priority is only drawn when it is not the default: "Yüksək" gets a restrained tonal
 * chip, "Aşağı" a quiet word, and Normal nothing at all. All three words stay in the accessible name, so
 * nothing about priority depends on seeing a colour.
 *
 * Completion, opening and the overflow menu are three separate targets; pressing the checkbox can never open
 * the editor.
 */
export function TaskRow({ task, onToggle, onPress, onMore, busy = false, context = 'day', today, showSeparator = false }: TaskRowProps) {
  const { colors, reducedMotion } = useTheme();
  const meta = rowMeta(task, context, today);
  // A timed task is already "overdue" once its own time has passed today — a real domain rule, and a different
  // thing from the overdue section, which holds earlier days. The time says so in the warning colour; only the
  // section's rows get the amber box, so one signal keeps one meaning.
  const late = task.isOverdue;
  const lateBox = context === 'overdue';
  const timed = hasTime(task) && context === 'day';
  const high = task.priority === 'High';
  const low = task.priority === 'Low';

  // The tick grows in over ~160 ms when the server confirms the completion, so the change is legible without
  // the row moving. Reduced motion lands on the final state directly, and nothing loops.
  const checked = useSharedValue(task.isCompleted ? 1 : 0);
  useEffect(() => {
    const target = task.isCompleted ? 1 : 0;
    checked.set(reducedMotion ? target : withTiming(target, { duration: Motion.quick, easing: Motion.easeOut }));
  }, [task.isCompleted, reducedMotion, checked]);
  const tickStyle = useAnimatedStyle(() => ({ opacity: checked.get(), transform: [{ scale: 0.6 + 0.4 * checked.get() }] }));

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
        scaleTo={0.88}
        containerStyle={styles.checkSlot}
        style={styles.checkTarget}
        testID={`task-toggle-${task.id}`}>
        <View
          style={[
            styles.checkbox,
            task.isCompleted ? { backgroundColor: colors.modulePlan, borderColor: colors.modulePlan } : { borderColor: lateBox ? colors.warningText : colors.borderStrong },
            busy ? { opacity: 0.55 } : null,
          ]}>
          <Animated.View style={tickStyle}>
            <Ionicons name="checkmark" size={16} color={colors.onPrimary} />
          </Animated.View>
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
        {/* A restrained mark for high priority: a rule beside the title, not a loud pill in the row. */}
        {high && !task.isCompleted ? <View style={[styles.priorityRule, { backgroundColor: colors.modulePlan }]} /> : null}

        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={3} color={task.isCompleted ? 'textMuted' : 'textPrimary'} style={task.isCompleted ? styles.done : undefined}>
            {task.title}
          </AppText>

          <View style={styles.metaRow}>
            <AppText
              variant="caption"
              color={late ? 'warningText' : timed ? 'textSecondary' : 'textMuted'}
              style={timed ? styles.tabular : undefined}
              numberOfLines={1}
              testID={`task-meta-${task.id}`}>
              {meta}
            </AppText>
            {high ? (
              <View style={[styles.chip, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name={priorityIcon(task.priority)} size={12} color={colors.primaryText} />
                <AppText variant="caption" color="primaryText" numberOfLines={1}>
                  {priorityLabel(task.priority)}
                </AppText>
              </View>
            ) : low ? (
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {priorityLabel(task.priority)}
              </AppText>
            ) : null}
            {task.seriesId ? (
              <View style={styles.metaItem}>
                <Ionicons name="repeat-outline" size={13} color={colors.textMuted} />
                <AppText variant="caption" color="textMuted">
                  Təkrarlanan
                </AppText>
              </View>
            ) : null}
          </View>

          {/* A preview only: the whole note stays in the task's own screen. */}
          {task.note && !task.isCompleted ? (
            <AppText variant="caption" color="textMuted" numberOfLines={1} testID={`task-note-${task.id}`}>
              {task.note}
            </AppText>
          ) : null}
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
  priorityRule: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 20,
    borderRadius: Radius.full,
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
