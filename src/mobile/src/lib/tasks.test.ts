import { completionPercent, completionSummary, dayDifference, dayHeading, groupByDay, overdueLabel, priorityLabel, relativeDayLabel, taskAccessibilityLabel, timeLabel, whenLabel } from '@/lib/tasks';
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
