import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';

import { WeekStrip, weekWindow, weekdayOf } from '@/components/week-strip';

describe('week window', () => {
  it('keeps the selected day in reach with days on both sides of it', () => {
    const week = weekWindow('2026-09-07', '2026-09-28');
    expect(week).toEqual(['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']);
    expect(week).toHaveLength(7);
  });

  it('ends on today whenever the selection is inside the current week', () => {
    expect(weekWindow('2026-09-28', '2026-09-28').at(-1)).toBe('2026-09-28');
    expect(weekWindow('2026-09-26', '2026-09-28').at(-1)).toBe('2026-09-28');
  });

  it('never runs past today, and steps over month and year ends as calendar days', () => {
    // A selection in the future (a stale value, say) still stops the window at today.
    expect(weekWindow('2026-10-05', '2026-09-28').at(-1)).toBe('2026-09-28');
    expect(weekWindow('2026-02-27', '2026-12-31')[0]).toBe('2026-02-24');
    expect(weekWindow('2025-12-31', '2026-12-31')[0]).toBe('2025-12-28');
    // 2028 is a leap year: the window crosses 29 February rather than skipping it.
    expect(weekWindow('2028-02-27', '2028-12-31')).toContain('2028-02-29');
  });

  it('names weekdays in Azerbaijani', () => {
    expect(weekdayOf('2026-09-28')).toBe('B.e.');
    expect(weekdayOf('2026-09-27')).toBe('B.');
  });
});

describe('WeekStrip', () => {
  function Harness({ today = '2026-09-28' }: { today?: string }) {
    const [value, setValue] = useState(today);
    return <WeekStrip value={value} onChange={setValue} today={today} />;
  }

  it('marks today and the selection separately and moves the window back with the selection', async () => {
    const view = await render(<Harness />);

    expect(view.getByTestId('week-day-2026-09-28')).toBeChecked();
    expect(view.getByLabelText('Bu gün, 28 sentyabr 2026')).toBeTruthy();
    // Older days are reachable; the newest cell is today, never tomorrow.
    expect(view.queryByTestId('week-day-2026-09-29')).toBeNull();

    await fireEvent.press(view.getByTestId('week-day-2026-09-22'));
    expect(view.getByTestId('week-day-2026-09-22')).toBeChecked();
    // The window slid back around the selection, and it still cannot reach past today.
    expect(view.getByTestId('week-day-2026-09-19')).toBeTruthy();
    expect(view.queryByTestId('week-day-2026-09-29')).toBeNull();
    // Stepping back again brings earlier days into reach; forward days stay reachable too.
    await fireEvent.press(view.getByTestId('week-day-2026-09-19'));
    expect(view.getByTestId('week-day-2026-09-16')).toBeTruthy();
    expect(view.getByTestId('week-day-2026-09-22')).toBeTruthy();
  });

  it('opens the shared calendar for anything older, and applies only a confirmed day', async () => {
    const view = await render(<Harness />);

    await fireEvent.press(view.getByTestId('week-strip-calendar'));
    await fireEvent.press(await view.findByLabelText(/^3 sentyabr 2026/));
    // Picking is not choosing: nothing changes until the sheet is confirmed.
    expect(view.getByTestId('week-day-2026-09-28')).toBeChecked();

    await fireEvent.press(view.getByTestId('calendar-confirm'));
    expect(await view.findByTestId('week-day-2026-09-03')).toBeChecked();
  });
});
