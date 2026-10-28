/**
 * Task helpers shared by the Plan screens, the row component and the Home summary.
 *
 * The API is the source of truth for what "today" and "overdue" mean — both are resolved there in the profile
 * time zone. Nothing here recomputes them; these functions only turn what the API said into Azerbaijani labels.
 */

import type { IconName } from '@/constants/categories';
import type { Task, TaskCounts, TaskPriority, TaskRecurrenceKind, TaskView } from '@/lib/api/tasks';
import { dateFromIso, formatLongDate, formatShortDate, formatWeekdayDate, todayIsoDate, utcIsoToLocalDate } from '@/lib/dates';

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

export type DayProgressState =
  /** Nothing scheduled and nothing owed: a day to plan, not a 0 / 0. */
  | 'empty'
  /** Nothing scheduled today, but earlier days are still owed. */
  | 'onlyOverdue'
  /** Something is still open today. */
  | 'partial'
  /** Everything scheduled for today is done — which says nothing about overdue work. */
  | 'done';

export interface DayProgress {
  state: DayProgressState;
  /** Today's open tasks: the figure the summary leads with. */
  remaining: number;
  scheduled: number;
  completed: number;
  overdue: number;
  /** Share of today's own tasks that are done, or null when there is nothing to be a fraction of. */
  percent: number | null;
}

/**
 * What today actually looks like, as one value the summary can switch on.
 *
 * Every figure comes from the API's aggregate over the whole day, never from the rows on screen, and "done"
 * is scoped to tasks scheduled for today: finishing them does not mean the overdue ones are finished.
 */
export function dayProgress(counts: TaskCounts | undefined): DayProgress {
  const scheduled = counts?.scheduled ?? 0;
  const completed = Math.min(counts?.completed ?? 0, scheduled);
  const overdue = counts?.overdue ?? 0;
  const remaining = scheduled - completed;
  const percent = scheduled === 0 ? null : Math.round((completed / scheduled) * 100);
  const state: DayProgressState = scheduled === 0 ? (overdue > 0 ? 'onlyOverdue' : 'empty') : remaining === 0 ? 'done' : 'partial';
  return { state, remaining, scheduled, completed, overdue, percent };
}

/** The headline of the summary: the number of open tasks, never a percentage of itself. */
export function remainingLabel(progress: DayProgress): string {
  switch (progress.state) {
    case 'empty':
      return 'Bu gün plan boşdur';
    case 'onlyOverdue':
      return `${progress.overdue} gecikmiş tapşırıq`;
    case 'done':
      return 'Bu günün hamısı tamamlandı';
    default:
      return `${progress.remaining} tapşırıq qalıb`;
  }
}

/** The quiet second line: the completed fraction, or what to do when there is no fraction. */
export function progressDetail(progress: DayProgress): string {
  switch (progress.state) {
    case 'empty':
      return 'Bu gün üçün tapşırıq planlaşdırın.';
    case 'onlyOverdue':
      return 'Bu gün üçün yeni tapşırıq yoxdur.';
    default:
      return `${progress.completed} / ${progress.scheduled} tamamlanıb`;
  }
}

/** "3 gecikmiş tapşırıq", shown apart from today's own figures; null when nothing is owed. */
export function overdueNote(progress: DayProgress): string | null {
  // The 'onlyOverdue' state already leads with this number; repeating it below would say it twice.
  if (progress.overdue === 0 || progress.state === 'onlyOverdue') {
    return null;
  }
  return `${progress.overdue} gecikmiş tapşırıq`;
}

/** "Çərşənbə, 30 sentyabr" for the header, from the local calendar date the API resolved. */
export function dayEyebrow(isoDate: string | undefined): string | undefined {
  return isoDate ? formatWeekdayDate(dateFromIso(isoDate)) : undefined;
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

/** Where a row is being shown, which decides what its metadata may leave out. */
export type RowContext =
  /** Under a heading that already names the day (today's list, an upcoming day group). */
  | 'day'
  /** The overdue section, where the day it was actually planned for is the point. */
  | 'overdue'
  /** The completed list, grouped by the day it was finished. */
  | 'completed';

/**
 * The one line under a title.
 *
 * `TaskItem` carries an optional time of day, not a duration, so a row shows a clock or says the task belongs to
 * the day as a whole — it never invents a start and end, and an untimed task is not treated as midnight. Under a
 * heading that already names the day, the day is left out instead of printing "Bu gün" on every row.
 */
export function rowMeta(task: Task, context: RowContext, today = todayIsoDate()): string {
  const time = timeLabel(task.plannedTime);
  if (context === 'overdue') {
    return time ? `${overdueLabel(task)} · ${time}` : overdueLabel(task);
  }
  if (context === 'completed') {
    // The heading is the day it was finished, so the row keeps the day it had been planned for.
    const planned = `Plan: ${formatShortDate(task.plannedDate)}`;
    return time ? `${planned} · ${time}` : planned;
  }
  return time ?? 'Gün ərzində';
}

/** True when the row's time should read as a clock rather than quiet supporting text. */
export function hasTime(task: Task): boolean {
  return task.plannedTime !== null;
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

/**
 * Groups completed tasks by the local day they were finished, keeping the order the API sent (it pages by
 * `completedAtUtc` descending, so grouping on the same field stays consistent across pages).
 */
export function groupByCompletionDay(tasks: readonly Task[]): { date: string; tasks: Task[] }[] {
  const groups: { date: string; tasks: Task[] }[] = [];
  for (const task of tasks) {
    // A completed task always carries its instant; the planned date is the honest fallback if it ever does not.
    const date = task.completedAtUtc ? utcIsoToLocalDate(task.completedAtUtc) : task.plannedDate;
    const last = groups.at(-1);
    if (last && last.date === date) {
      last.tasks.push(task);
    } else {
      groups.push({ date, tasks: [task] });
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
