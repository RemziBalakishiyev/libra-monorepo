import type { Task, TaskDay, TaskDetail, TaskPriority } from '@/lib/api/tasks';

export const taskToday = '2026-09-08';

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Həkimə zəng et',
    note: null,
    plannedDate: taskToday,
    plannedTime: null,
    priority: 'Normal' as TaskPriority,
    state: 'Pending',
    isCompleted: false,
    completedAtUtc: null,
    isOverdue: false,
    seriesId: null,
    seriesKind: null,
    clientRequestId: null,
    createdAtUtc: '2026-09-08T05:00:00Z',
    updatedAtUtc: '2026-09-08T05:00:00Z',
    ...overrides,
  };
}

export function makeDay(overrides: Partial<TaskDay> = {}): TaskDay {
  const tasks = overrides.tasks ?? [makeTask()];
  const overdue = overrides.overdue ?? [];
  return {
    date: taskToday,
    timeZone: 'Asia/Baku',
    counts: overrides.counts ?? {
      scheduled: tasks.length,
      completed: tasks.filter((task) => task.isCompleted).length,
      overdue: overdue.length,
    },
    tasks,
    overdue,
    ...overrides,
  };
}

export function makeDetail(task: Task = makeTask()): TaskDetail {
  return { task, series: null, history: [] };
}

export function pagedTasks(items: Task[], hasNextPage = false) {
  return { items, pageNumber: 1, pageSize: 20, totalCount: items.length, hasNextPage };
}
