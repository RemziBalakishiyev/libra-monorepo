/**
 * Task helpers shared by the Plan screens, the row component and the Home summary.
 *
 * The API is the source of truth for what "today" and "overdue" mean — both are resolved there in the profile
 * time zone. Nothing here recomputes them; these functions only turn what the API said into Azerbaijani labels.
 */

import type { IconName } from '@/constants/categories';
import type { Task, TaskCounts, TaskPriority, TaskRecurrenceKind, TaskView } from '@/lib/api/tasks';
import { formatLongDate, formatShortDate, todayIsoDate } from '@/lib/dates';

interface PriorityDefinition {
  value: TaskPriority;
  label: string;
  /** Shown next to the label so priority never depends on colour alone. */
  icon: IconName;
}

/** The three priorities, least to most urgent — the order the segmented control uses. */
export const priorities: readonly PriorityDefinition[] = [
  { value: 'Low', label: 'Aşağı', icon: 'chevron-down-outline' },
  { value: 'Normal', label: 'Normal', icon: 'remove-outline' },
  { value: 'High', label: 'Yüksək', icon: 'chevron-up-outline' },
];

export function priorityLabel(priority: TaskPriority): string {
  return priorities.find((entry) => entry.value === priority)?.label ?? priority;
}

export function priorityIcon(priority: TaskPriority): IconName {
  return priorities.find((entry) => entry.value === priority)?.icon ?? 'remove-outline';
}

interface ViewDefinition {
  value: TaskView;
  label: string;
  /** Fits three segments on a 360 pt phone; the full label stays the accessible name. */
  shortLabel: string;
  icon: IconName;
}

export const taskViews: readonly ViewDefinition[] = [
  { value: 'Today', label: 'Bu gün', shortLabel: 'Bu gün', icon: 'today-outline' },
  { value: 'Upcoming', label: 'Qarşıdakı', shortLabel: 'Qarşıdakı', icon: 'calendar-outline' },
  { value: 'Completed', label: 'Tamamlananlar', shortLabel: 'Tamamlanan', icon: 'checkmark-done-outline' },
];

/** ISO weekday numbers, 1 = Monday … 7 = Sunday, with the short labels the picker shows. */
export const weekdays: readonly { value: number; label: string; long: string }[] = [
  { value: 1, label: 'B.e.', long: 'Bazar ertəsi' },
  { value: 2, label: 'Ç.a.', long: 'Çərşənbə axşamı' },
  { value: 3, label: 'Ç.', long: 'Çərşənbə' },
  { value: 4, label: 'C.a.', long: 'Cümə axşamı' },
  { value: 5, label: 'C.', long: 'Cümə' },
  { value: 6, label: 'Ş.', long: 'Şənbə' },
  { value: 7, label: 'B.', long: 'Bazar' },
];

export const recurrenceLabels: Record<TaskRecurrenceKind, string> = {
  None: 'Təkrarlanmır',
  Daily: 'Hər gün',
  Weekly: 'Həftəlik',
};

/** "2 / 5 tamamlanıb", or an honest sentence when the day holds nothing. */
export function completionSummary(counts: TaskCounts | undefined): string {
  if (!counts || counts.scheduled === 0) {
    return 'Bu gün tapşırıq yoxdur';
  }
  return `${counts.completed} / ${counts.scheduled} tamamlanıb`;
}

/** Whole-percent progress for the day, or null when there is nothing to be a fraction of. */
export function completionPercent(counts: TaskCounts | undefined): number | null {
  if (!counts || counts.scheduled === 0) {
    return null;
  }
  return Math.round((counts.completed / counts.scheduled) * 100);
}

/** "Gecikib · 5 sen" for an overdue task, so the day it was actually planned for stays visible. */
export function overdueLabel(task: Task): string {
  return `Gecikib · ${formatShortDate(task.plannedDate)}`;
}

/** "09:00" from the API's "09:00:00"; null when the task has no time of day. */
export function timeLabel(plannedTime: string | null): string | null {
  return plannedTime ? plannedTime.slice(0, 5) : null;
}

/** The date and time a row shows: "Bu gün", "Sabah" or the short date, plus the time when there is one. */
export function whenLabel(task: Task, today = todayIsoDate()): string {
  const time = timeLabel(task.plannedTime);
  const day = relativeDayLabel(task.plannedDate, today);
  return time ? `${day} · ${time}` : day;
}

/** Day label relative to today, using local calendar dates rather than instants. */
export function relativeDayLabel(plannedDate: string, today = todayIsoDate()): string {
  const difference = dayDifference(plannedDate, today);
  if (difference === 0) {
    return 'Bu gün';
  }
  if (difference === 1) {
    return 'Sabah';
  }
  if (difference === -1) {
    return 'Dünən';
  }
  return formatShortDate(plannedDate);
}

/** Whole days from `today` to `plannedDate`; negative in the past. Both are YYYY-MM-DD. */
export function dayDifference(plannedDate: string, today: string): number {
  return Math.round((Date.parse(`${plannedDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** The accessible name of one row: everything a sighted user reads from it, in one sentence. */
export function taskAccessibilityLabel(task: Task, today = todayIsoDate()): string {
  const parts = [task.title, whenLabel(task, today), `${priorityLabel(task.priority)} prioritet`];
  if (task.isOverdue) {
    parts.push('gecikib');
  }
  if (task.seriesId) {
    parts.push('təkrarlanan');
  }
  parts.push(task.isCompleted ? 'tamamlanıb' : 'tamamlanmayıb');
  return parts.join(', ');
}

/** Groups upcoming tasks by their planned day, keeping the order the API sent. */
export function groupByDay(tasks: readonly Task[]): { date: string; tasks: Task[] }[] {
  const groups: { date: string; tasks: Task[] }[] = [];
  for (const task of tasks) {
    const last = groups.at(-1);
    if (last && last.date === task.plannedDate) {
      last.tasks.push(task);
    } else {
      groups.push({ date: task.plannedDate, tasks: [task] });
    }
  }
  return groups;
}

/** Long day heading for an upcoming group: "Sabah · 9 sentyabr 2026". */
export function dayHeading(date: string, today = todayIsoDate()): string {
  const relative = relativeDayLabel(date, today);
  const long = formatLongDate(date);
  return relative === long ? long : `${relative} · ${long}`;
}
