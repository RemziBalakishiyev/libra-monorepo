import { averageLabel, describeDay, describeDuration, elapsedMinutes, formatDuration, formatInterval, minutesBetween, peakMinutes, splitInstant } from '@/lib/sleep';
import { makeDays, makeOpenSession, makeSession, makeSummary } from '@/test/sleep-fixtures';

describe('sleep durations', () => {
  it('derives a running session from its stored start instant and the clock it is given', () => {
    const session = makeOpenSession({ startedAtUtc: '2026-09-09T22:15:00Z' });

    // Two different "now"s, one unchanged record: the number on screen is arithmetic, not an accumulated timer.
    expect(elapsedMinutes(session, new Date('2026-09-09T23:00:00Z'))).toBe(45);
    expect(elapsedMinutes(session, new Date('2026-09-10T05:45:00Z'))).toBe(450);
  });

  it('reports the recorded length of a completed session, whatever the clock says', () => {
    const session = makeSession({ startedAtUtc: '2026-09-09T22:00:00Z', endedAtUtc: '2026-09-10T05:30:00Z' });

    expect(elapsedMinutes(session, new Date('2026-09-11T00:00:00Z'))).toBe(450);
    expect(elapsedMinutes(session, new Date('2026-09-10T05:31:00Z'))).toBe(450);
  });

  it('never reports negative time for a start instant ahead of this device clock', () => {
    const session = makeOpenSession({ startedAtUtc: '2026-09-10T09:02:00Z' });

    expect(elapsedMinutes(session, new Date('2026-09-10T09:00:00Z'))).toBe(0);
  });

  it('counts whole minutes across a date boundary', () => {
    expect(minutesBetween('2026-09-09T23:40:00Z', '2026-09-10T07:10:00Z')).toBe(450);
  });

  it('writes and speaks the same figure two ways', () => {
    expect(formatDuration(450)).toBe('7 s 30 d');
    expect(describeDuration(450)).toBe('7 saat 30 dəqiqə');
    expect(formatDuration(420)).toBe('7 s');
    expect(describeDuration(45)).toBe('45 dəqiqə');
    expect(formatDuration(0)).toBe('0 d');
  });

  it('shows a running night as open-ended rather than inventing an end', () => {
    expect(formatInterval(makeOpenSession({ startedAtUtc: '2026-09-09T19:00:00Z' }))).toMatch(/…$/);
  });
});

describe('sleep week', () => {
  it('labels the average with the days it was actually averaged over', () => {
    const summary = makeSummary({ days: makeDays([null, 420, null, 480, null, null, 450]) });

    // Three recorded nights out of seven dates: the mean is over three, and says so.
    expect(summary.recordedDays).toBe(3);
    expect(averageLabel(summary)).toBe('7 s 30 d · 3 gün üzrə');
  });

  it('says there is nothing yet rather than averaging zero', () => {
    expect(averageLabel(makeSummary({ days: makeDays([null, null, null, null, null, null, null]) }))).toBe('Hələ qeyd yoxdur');
    expect(averageLabel(undefined)).toBe('Hələ qeyd yoxdur');
  });

  it('reads an empty date as "no record", not as zero sleep', () => {
    const [empty, recorded] = makeDays([null, 480]);

    expect(describeDay(empty!)).toMatch(/Qeyd yoxdur$/);
    expect(describeDay(recorded!)).toMatch(/8 saat$/);
  });

  it('keeps the bar scale usable when every date is empty', () => {
    expect(peakMinutes(makeDays([null, null]))).toBe(1);
    expect(peakMinutes(makeDays([420, 480]))).toBe(480);
  });
});

describe('splitInstant', () => {
  it('round-trips an instant into the local date and time the form edits', () => {
    const instant = new Date(2026, 8, 9, 23, 40).toISOString();

    expect(splitInstant(instant)).toEqual({ date: '2026-09-09', time: '23:40' });
  });
});
