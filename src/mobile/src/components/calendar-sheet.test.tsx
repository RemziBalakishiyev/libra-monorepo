import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';

import { CalendarSheet, isPermitted, monthCells, previousDay } from '@/components/calendar-sheet';
import { DateField } from '@/components/date-field';
import { setProfileTimeZone, todayInProfileZone } from '@/lib/dates';

describe('calendar helpers', () => {
  it('lays a month out Monday-first and knows six-row months and leap days', () => {
    // March 2026 starts on a Sunday and has 31 days: six rows.
    const march = monthCells(2026, 3);
    expect(march.length).toBe(42);
    expect(march.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(march[6]).toBe(1);
    // February 2028 is a leap month; February 2026 is not.
    expect(monthCells(2028, 2).filter((day) => day !== null).length).toBe(29);
    expect(monthCells(2026, 2).filter((day) => day !== null).length).toBe(28);
    // Every grid is whole weeks.
    for (const [year, month] of [
      [2026, 1],
      [2026, 2],
      [2026, 3],
      [2027, 12],
      [2028, 2],
    ] as const) {
      expect(monthCells(year, month).length % 7).toBe(0);
    }
  });

  it("steps calendar days without instants and applies the caller's bounds as calendar dates", () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28');
    expect(previousDay('2028-03-01')).toBe('2028-02-29');
    expect(previousDay('2026-01-01')).toBe('2025-12-31');
    const max = new Date(2026, 8, 18, 23, 59);
    expect(isPermitted('2026-09-18', undefined, max)).toBe(true);
    expect(isPermitted('2026-09-19', undefined, max)).toBe(false);
    expect(isPermitted('2026-09-01', new Date(2026, 8, 2), undefined)).toBe(false);
    expect(isPermitted('2026-09-02', new Date(2026, 8, 2), undefined)).toBe(true);
  });

  it('resolves today in the profile time zone, not the device zone', () => {
    // 21:30 UTC on the 18th is the 19th in Baku and still the 18th in Honolulu.
    const instant = new Date('2026-09-18T21:30:00Z');
    expect(todayInProfileZone(instant, 'Asia/Baku')).toBe('2026-09-19');
    expect(todayInProfileZone(instant, 'Pacific/Honolulu')).toBe('2026-09-18');
    setProfileTimeZone('Asia/Baku');
    expect(todayInProfileZone(instant)).toBe('2026-09-19');
    setProfileTimeZone(undefined);
  });
});

describe('CalendarSheet', () => {
  it('changes only the pending date until "Təsdiqlə" commits it once and closes', async () => {
    const onConfirm = jest.fn();
    const onClose = jest.fn();
    const view = await render(<CalendarSheet visible value="2026-09-06" onConfirm={onConfirm} onClose={onClose} today="2026-09-18" />);

    expect(view.getByText('Sentyabr 2026')).toBeTruthy();
    expect(view.getByRole('header', { name: 'Tarix seç' })).toBeTruthy();
    expect(view.getByRole('radio', { name: '6 sentyabr 2026' }).props.accessibilityState.checked).toBe(true);
    // Today is marked, not selected.
    expect(view.getByRole('radio', { name: '18 sentyabr 2026, bu gün' }).props.accessibilityState.checked).toBe(false);

    await fireEvent.press(view.getByRole('radio', { name: '12 sentyabr 2026' }));
    expect(view.getByRole('radio', { name: '12 sentyabr 2026' }).props.accessibilityState.checked).toBe(true);
    expect(view.getByTestId('calendar-summary')).toHaveTextContent('12 sentyabr 2026');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await fireEvent.press(view.getByTestId('calendar-confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('2026-09-12');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('crosses month and year boundaries without touching the owner, and shortcuts move the month into view', async () => {
    const onConfirm = jest.fn();
    const view = await render(<CalendarSheet visible value="2026-01-15" onConfirm={onConfirm} onClose={jest.fn()} today="2026-01-15" />);

    await fireEvent.press(view.getByRole('button', { name: 'Əvvəlki ay' }));
    expect(view.getByText('Dekabr 2025')).toBeTruthy();
    expect(view.getByRole('radio', { name: '31 dekabr 2025' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Növbəti ay' }));
    await fireEvent.press(view.getByRole('button', { name: 'Növbəti ay' }));
    expect(view.getByText('Fevral 2026')).toBeTruthy();
    expect(view.queryByRole('radio', { name: '29 fevral 2026' })).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    // "Dünən" selects 14 January and brings January back.
    await fireEvent.press(view.getByRole('button', { name: /^Dünən/ }));
    expect(view.getByText('Yanvar 2026')).toBeTruthy();
    expect(view.getByRole('radio', { name: '14 yanvar 2026' }).props.accessibilityState.checked).toBe(true);
    // Reaching a leap day two years on.
    for (let step = 0; step < 25; step += 1) {
      await fireEvent.press(view.getByRole('button', { name: 'Növbəti ay' }));
    }
    expect(view.getByText('Fevral 2028')).toBeTruthy();
    expect(view.getByRole('radio', { name: '29 fevral 2028' })).toBeTruthy();
  });

  it("blocks days outside the caller's policy, hides shortcuts they exclude, and disables confirming a blocked date", async () => {
    const onConfirm = jest.fn();
    const view = await render(<CalendarSheet visible value="2026-09-10" onConfirm={onConfirm} onClose={jest.fn()} today="2026-09-18" maximumDate={new Date(2026, 8, 18)} />);

    const future = view.getByRole('radio', { name: '25 sentyabr 2026, seçilə bilməz' });
    expect(future.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(future);
    expect(view.getByRole('radio', { name: '10 sentyabr 2026' }).props.accessibilityState.checked).toBe(true);
    // Both shortcuts are permitted here…
    expect(view.getByRole('button', { name: /^Bu gün/ })).toBeTruthy();
    expect(view.getByRole('button', { name: /^Dünən/ })).toBeTruthy();

    // …but when today itself is after the maximum, neither is offered and a blocked committed date cannot be confirmed.
    const strict = await render(<CalendarSheet visible value="2026-09-20" onConfirm={onConfirm} onClose={jest.fn()} today="2026-09-20" maximumDate={new Date(2026, 8, 18)} />);
    expect(strict.queryByRole('button', { name: /^Bu gün/ })).toBeNull();
    expect(strict.queryByRole('button', { name: /^Dünən/ })).toBeNull();
    expect(strict.getByTestId('calendar-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(strict.getByTestId('calendar-confirm'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('discards the pending date on close and reopens from the committed value and its month', async () => {
    function Harness() {
      const [value, setValue] = useState('2026-09-06');
      return <DateField label="Tarix" value={value} onChange={setValue} testID="date-field" />;
    }
    const view = await render(<Harness />);
    expect(view.getByLabelText('Tarix: 6 sentyabr 2026')).toBeTruthy();

    // Pick a day in another month, then leave through the close control: nothing changes.
    // DateField owns its own "today", so day names are matched by prefix: whichever day is really today
    // carries a ", bu gün" suffix and must not break this test on that one date of the year.
    await fireEvent.press(view.getByTestId('date-field'));
    await view.findByTestId('calendar-grid');
    await fireEvent.press(view.getByRole('button', { name: 'Növbəti ay' }));
    await fireEvent.press(view.getByRole('radio', { name: /^3 oktyabr 2026/ }));
    await fireEvent.press(view.getAllByRole('button', { name: 'Bağla' })[0]!);
    await waitFor(() => expect(view.queryByTestId('calendar-grid')).toBeNull());
    expect(view.getByLabelText('Tarix: 6 sentyabr 2026')).toBeTruthy();

    // Reopening shows September with the 6th checked again.
    await fireEvent.press(view.getByTestId('date-field'));
    await view.findByTestId('calendar-grid');
    expect(view.getByText('Sentyabr 2026')).toBeTruthy();
    expect(view.getByRole('radio', { name: /^6 sentyabr 2026/ }).props.accessibilityState.checked).toBe(true);

    // Confirming does commit to the field.
    await fireEvent.press(view.getByRole('radio', { name: /^9 sentyabr 2026/ }));
    await fireEvent.press(view.getByTestId('calendar-confirm'));
    await waitFor(() => expect(view.queryByTestId('calendar-grid')).toBeNull());
    expect(view.getByLabelText('Tarix: 9 sentyabr 2026')).toBeTruthy();
  });

  it('keeps one tab stop on the pending day and leaves blocked days out of the keyboard order', async () => {
    const view = await render(<CalendarSheet visible value="2026-09-06" onConfirm={jest.fn()} onClose={jest.fn()} today="2026-09-18" maximumDate={new Date(2026, 8, 18)} />);
    expect(view.getByRole('radio', { name: '6 sentyabr 2026' }).props.tabIndex).toBe(0);
    expect(view.getByRole('radio', { name: '7 sentyabr 2026' }).props.tabIndex).toBe(-1);
    expect(view.getByRole('radio', { name: '25 sentyabr 2026, seçilə bilməz' }).props.tabIndex).toBe(-1);
    await fireEvent.press(view.getByRole('radio', { name: '7 sentyabr 2026' }));
    expect(view.getByRole('radio', { name: '7 sentyabr 2026' }).props.tabIndex).toBe(0);
    expect(view.getByRole('radio', { name: '6 sentyabr 2026' }).props.tabIndex).toBe(-1);
  });
});
