import {
  completionPercent,
  completionSummary,
  dayDifference,
  dayEyebrow,
  dayHeading,
  dayProgress,
  groupByCompletionDay,
  groupByDay,
  overdueLabel,
  overdueNote,
  priorityLabel,
  progressDetail,
  relativeDayLabel,
  remainingLabel,
  rowMeta,
  taskAccessibilityLabel,
  timeLabel,
  whenLabel,
} from '@/lib/tasks';
import { makeTask, taskToday } from '@/test/task-fixtures';

describe('task labels', () => {
  it('summarises the day as a fraction of what is scheduled', () => {
    expect(completionSummary({ scheduled: 5, completed: 2, overdue: 1 })).toBe('2 / 5 tamamlanıb');
    expect(completionPercent({ scheduled: 5, completed: 2, overdue: 0 })).toBe(40);
  });

  it('says plainly when a day has nothing, rather than showing 0 / 0', () => {
    expect(completionSummary({ scheduled: 0, completed: 0, overdue: 0 })).toBe('Bu gün tapşırıq yoxdur');
    expect(completionSummary(undefined)).toBe('Bu gün tapşırıq yoxdur');
    // Nothing to be a fraction of, so no percentage is invented.
    expect(completionPercent({ scheduled: 0, completed: 0, overdue: 0 })).toBeNull();
  });

  it('counts overdue tasks apart from the day itself', () => {
    // Two overdue tasks do not change how much of today is done.
    expect(completionSummary({ scheduled: 3, completed: 3, overdue: 2 })).toBe('3 / 3 tamamlanıb');
    expect(completionPercent({ scheduled: 3, completed: 3, overdue: 2 })).toBe(100);
  });

  it('keeps the original date on an overdue task', () => {
    expect(overdueLabel(makeTask({ plannedDate: '2026-09-05', isOverdue: true }))).toBe('Gecikib · 5 sen');
  });

  it('reads a time back without its seconds, and nothing when there is none', () => {
    expect(timeLabel('09:30:00')).toBe('09:30');
    expect(timeLabel(null)).toBeNull();
  });

  it('labels days relative to today in local calendar terms', () => {
    expect(relativeDayLabel(taskToday, taskToday)).toBe('Bu gün');
    expect(relativeDayLabel('2026-09-09', taskToday)).toBe('Sabah');
    expect(relativeDayLabel('2026-09-07', taskToday)).toBe('Dünən');
    expect(relativeDayLabel('2026-09-14', taskToday)).toBe('14 sen');
  });

  it('counts whole days across a month boundary', () => {
    expect(dayDifference('2026-10-01', '2026-09-30')).toBe(1);
    expect(dayDifference('2026-09-01', '2026-09-30')).toBe(-29);
  });

  it('shows the time beside the day when the task has one', () => {
    expect(whenLabel(makeTask({ plannedDate: taskToday, plannedTime: '09:30:00' }), taskToday)).toBe('Bu gün · 09:30');
    expect(whenLabel(makeTask({ plannedDate: taskToday }), taskToday)).toBe('Bu gün');
  });

  it('names priorities in Azerbaijani', () => {
    expect(priorityLabel('Low')).toBe('Aşağı');
    expect(priorityLabel('Normal')).toBe('Normal');
    expect(priorityLabel('High')).toBe('Yüksək');
  });

  it('reads a row out in one sentence, state included', () => {
    const label = taskAccessibilityLabel(makeTask({ title: 'Həkimə zəng et', plannedTime: '09:00:00', priority: 'High', isOverdue: true, seriesId: 's1' }), taskToday);

    expect(label).toBe('Həkimə zəng et, Bu gün · 09:00, Yüksək prioritet, gecikib, təkrarlanan, tamamlanmayıb');
    expect(taskAccessibilityLabel(makeTask({ isCompleted: true }), taskToday)).toContain('tamamlanıb');
  });

  it('groups upcoming tasks by day without reordering them', () => {
    const groups = groupByDay([
      makeTask({ id: 'a', plannedDate: '2026-09-09' }),
      makeTask({ id: 'b', plannedDate: '2026-09-09' }),
      makeTask({ id: 'c', plannedDate: '2026-09-11' }),
    ]);

    expect(groups.map((group) => group.date)).toEqual(['2026-09-09', '2026-09-11']);
    expect(groups[0]!.tasks.map((task) => task.id)).toEqual(['a', 'b']);
  });

  it('heads a day group with both the relative and the full date', () => {
    expect(dayHeading('2026-09-09', taskToday)).toBe('Sabah · 9 sentyabr 2026');
    expect(dayHeading('2026-09-14', taskToday)).toBe('14 sen · 14 sentyabr 2026');
  });
});

describe('day progress', () => {
  it('leads with what is still open, and keeps the fraction underneath', () => {
    const progress = dayProgress({ scheduled: 5, completed: 2, overdue: 0 });
    expect(progress).toMatchObject({ state: 'partial', remaining: 3, percent: 40 });
    expect(remainingLabel(progress)).toBe('3 tapşırıq qalıb');
    expect(progressDetail(progress)).toBe('2 / 5 tamamlanıb');
  });

  it('scopes "done" to today and still reports what is owed from before', () => {
    const progress = dayProgress({ scheduled: 3, completed: 3, overdue: 2 });
    expect(progress.state).toBe('done');
    expect(remainingLabel(progress)).toBe('Bu günün hamısı tamamlandı');
    expect(progressDetail(progress)).toBe('3 / 3 tamamlanıb');
    // Finishing today says nothing about the overdue work, so it is reported separately.
    expect(overdueNote(progress)).toBe('2 gecikmiş tapşırıq');
  });

  it('plans an empty day instead of reporting 0 / 0 or a fabricated 100%', () => {
    const progress = dayProgress({ scheduled: 0, completed: 0, overdue: 0 });
    expect(progress).toMatchObject({ state: 'empty', remaining: 0, percent: null });
    expect(remainingLabel(progress)).toBe('Bu gün plan boşdur');
    expect(progressDetail(progress)).toBe('Bu gün üçün tapşırıq planlaşdırın.');
    expect(overdueNote(progress)).toBeNull();
  });

  it('leads with the overdue count when today is empty but earlier days are not', () => {
    const progress = dayProgress({ scheduled: 0, completed: 0, overdue: 4 });
    expect(progress.state).toBe('onlyOverdue');
    expect(remainingLabel(progress)).toBe('4 gecikmiş tapşırıq');
    expect(progressDetail(progress)).toBe('Bu gün üçün yeni tapşırıq yoxdur.');
    // It is already the headline; repeating it below would say the same number twice.
    expect(overdueNote(progress)).toBeNull();
    expect(progress.percent).toBeNull();
  });

  it('survives counts that have not caught up with each other', () => {
    // A completed figure ahead of the scheduled one must never produce a negative remainder.
    expect(dayProgress({ scheduled: 2, completed: 5, overdue: 0 })).toMatchObject({ remaining: 0, state: 'done' });
    expect(dayProgress(undefined)).toMatchObject({ state: 'empty', remaining: 0, percent: null });
  });

  it('names the shown day in the profile time zone', () => {
    expect(dayEyebrow('2026-09-30')).toBe('Çərşənbə, 30 sentyabr');
    expect(dayEyebrow(undefined)).toBeUndefined();
  });
});

describe('row metadata', () => {
  it('says the time, or that the task belongs to the day', () => {
    expect(rowMeta(makeTask({ plannedTime: '09:30:00' }), 'day', taskToday)).toBe('09:30');
    // An optional time is not a duration, and an untimed task is not midnight.
    expect(rowMeta(makeTask({ plannedTime: null }), 'day', taskToday)).toBe('Gün ərzində');
  });

  it('keeps the day an overdue task was planned for', () => {
    const late = makeTask({ plannedDate: '2026-09-05', isOverdue: true });
    expect(rowMeta(late, 'overdue', taskToday)).toBe('Gecikib · 5 sen');
    expect(rowMeta(makeTask({ plannedDate: '2026-09-05', plannedTime: '18:00:00', isOverdue: true }), 'overdue', taskToday)).toBe('Gecikib · 5 sen · 18:00');
  });

  it('keeps the planned day on a completed row, where the heading is the day it was finished', () => {
    expect(rowMeta(makeTask({ plannedDate: '2026-09-05' }), 'completed', taskToday)).toBe('Plan: 5 sen');
  });
});

describe('completed grouping', () => {
  it('groups by the local day a task was finished, in the order the API sent', () => {
    const groups = groupByCompletionDay([
      makeTask({ id: 'a', completedAtUtc: '2026-09-08T12:00:00Z' }),
      makeTask({ id: 'b', completedAtUtc: '2026-09-08T09:00:00Z' }),
      // Midday, so the grouping is the same calendar day in any plausible device zone.
      makeTask({ id: 'c', completedAtUtc: '2026-09-07T12:00:00Z' }),
    ]);
    expect(groups.map((group) => group.date)).toEqual(['2026-09-08', '2026-09-07']);
    expect(groups[0]!.tasks.map((task) => task.id)).toEqual(['a', 'b']);
  });

  it('falls back to the planned day if an instant is ever missing', () => {
    const groups = groupByCompletionDay([makeTask({ id: 'a', plannedDate: '2026-09-04', completedAtUtc: null })]);
    expect(groups[0]!.date).toBe('2026-09-04');
  });
});
