import {
  beginPhase,
  canSwitchPhase,
  clampPhaseSeconds,
  defaultFocusSettings,
  deadlineMs,
  elapsedSeconds,
  finishEarly,
  formatCountdown,
  formatDuration,
  hasExpired,
  nextPhase,
  normalizeSettings,
  pause,
  progress,
  readyState,
  remainingSeconds,
  resume,
  setDuration,
  settle,
  start,
  switchPhase,
  terminalRecord,
  type FocusState,
} from '@/lib/focus/machine';

/** A controlled clock: every test states the instants it cares about instead of waiting through a Pomodoro. */
const T0 = Date.parse('2026-09-30T09:00:00.000Z');
const at = (seconds: number) => T0 + seconds * 1000;

function ready(overrides: Partial<FocusState> = {}): FocusState {
  return { ...readyState(defaultFocusSettings, 'focus', 'session-1'), ...overrides };
}

describe('starting and running', () => {
  it('spends nothing until it is started', () => {
    const state = ready();

    expect(state.status).toBe('ready');
    expect(elapsedSeconds(state, at(600))).toBe(0);
    expect(remainingSeconds(state, at(600))).toBe(1500);
    expect(deadlineMs(state)).toBeNull();
  });

  it('counts from the instant it started, not from a tick', () => {
    const running = start(ready(), T0);

    expect(elapsedSeconds(running, at(90))).toBe(90);
    expect(remainingSeconds(running, at(90))).toBe(1410);
    expect(deadlineMs(running)).toBe(at(1500));
  });

  it('snapshots the configured duration, so a later settings change does not move a running phase', () => {
    const running = start(setDuration(ready(), 50 * 60), T0);

    // Changing the duration mid-run is refused outright; the phase keeps what it started with.
    expect(setDuration(running, 15 * 60).durationSeconds).toBe(3000);
    expect(deadlineMs(running)).toBe(at(3000));
  });

  it('never reports negative remaining time or more focus than the phase was configured for', () => {
    const running = start(ready(), T0);

    // Long past the deadline, and with a clock that moved backwards.
    expect(remainingSeconds(running, at(99_999))).toBe(0);
    expect(elapsedSeconds(running, at(99_999))).toBe(1500);
    expect(elapsedSeconds(running, T0 - 60_000)).toBe(0);
    expect(progress(running, at(99_999))).toBe(1);
    expect(progress(running, T0 - 60_000)).toBe(0);
  });
});

describe('pause and resume', () => {
  it('freezes the remainder and excludes the paused time', () => {
    const paused = pause(start(ready(), T0), at(300));

    // Five minutes in, then paused for an hour: still five minutes spent.
    expect(elapsedSeconds(paused, at(3900))).toBe(300);
    expect(remainingSeconds(paused, at(3900))).toBe(1200);
    expect(deadlineMs(paused)).toBeNull();

    const resumed = resume(paused, at(3900));
    // The deadline is the remainder from the moment it resumed, not the original one.
    expect(deadlineMs(resumed)).toBe(at(3900 + 1200));
    expect(elapsedSeconds(resumed, at(4200))).toBe(600);
  });

  it('records each stretch separately so the pause is a gap, not time spent', () => {
    const paused = pause(start(ready(), T0), at(600));
    const finished = finishEarly(resume(paused, at(1800)), at(2100));

    expect(finished.intervals).toEqual([
      { startedAtUtc: new Date(T0).toISOString(), endedAtUtc: new Date(at(600)).toISOString() },
      { startedAtUtc: new Date(at(1800)).toISOString(), endedAtUtc: new Date(at(2100)).toISOString() },
    ]);
    expect(elapsedSeconds(finished, at(9999))).toBe(900);
  });

  it('ignores a pause when nothing is running and a resume when nothing is paused', () => {
    const idle = ready();
    expect(pause(idle, at(10))).toBe(idle);
    expect(resume(idle, at(10))).toBe(idle);

    const running = start(idle, T0);
    expect(resume(running, at(10))).toBe(running);
  });
});

describe('expiry', () => {
  it('settles at the deadline, not at the moment the app came back', () => {
    const running = start(ready(), T0);

    // The phase ran out at 25 minutes; the app was reopened two hours later.
    const settled = settle(running, at(7200));

    expect(settled.status).toBe('finished');
    expect(settled.outcome).toBe('completed');
    expect(settled.intervals).toEqual([{ startedAtUtc: new Date(T0).toISOString(), endedAtUtc: new Date(at(1500)).toISOString() }]);
    expect(elapsedSeconds(settled, at(7200))).toBe(1500);
  });

  it('settles a phase that spanned a pause at its real deadline', () => {
    const resumed = resume(pause(start(ready(), T0), at(600)), at(1200));

    // 600 spent, 900 left from 1200: the deadline is 2100.
    expect(deadlineMs(resumed)).toBe(at(2100));
    const settled = settle(resumed, at(5000));
    expect(settled.intervals.at(-1)!.endedAtUtc).toBe(new Date(at(2100)).toISOString());
    expect(elapsedSeconds(settled, at(5000))).toBe(1500);
  });

  it('settles exactly once however many events race for it', () => {
    const running = start(ready(), T0);

    // A notification tap, a foreground event and the display tick all arriving at once.
    const once = settle(running, at(1600));
    const twice = settle(once, at(1700));
    const thrice = settle(twice, at(9000));

    expect(twice).toBe(once);
    expect(thrice).toBe(once);
    expect(once.completedRuns).toBe(1);
    expect(once.intervals).toHaveLength(1);
  });

  it('does nothing before the deadline', () => {
    const running = start(ready(), T0);

    expect(settle(running, at(1499))).toBe(running);
    expect(hasExpired(running, at(1499))).toBe(false);
    expect(hasExpired(running, at(1500))).toBe(true);
  });

  it('treats a pause at or past the deadline as the expiry it really is', () => {
    const paused = pause(start(ready(), T0), at(1500));

    expect(paused.status).toBe('finished');
    expect(paused.outcome).toBe('completed');
  });
});

describe('ending early', () => {
  it('keeps the time spent and is never a completed run', () => {
    const stopped = finishEarly(start(ready(), T0), at(540));

    expect(stopped.status).toBe('finished');
    expect(stopped.outcome).toBe('stopped');
    expect(elapsedSeconds(stopped, at(9999))).toBe(540);
    // A stopped run does not advance the cycle towards a long break.
    expect(stopped.completedRuns).toBe(0);
  });

  it('can end a paused run without resuming it first', () => {
    const stopped = finishEarly(pause(start(ready(), T0), at(300)), at(1200));

    expect(stopped.outcome).toBe('stopped');
    expect(elapsedSeconds(stopped, at(9999))).toBe(300);
  });
});

describe('phases and the cycle', () => {
  it('offers a short break after a focus run and a long one after the fourth', () => {
    let state = ready();
    for (let run = 1; run <= 4; run += 1) {
      state = settle(start(state, T0), at(1500));
      expect(state.completedRuns).toBe(run);
      const following = nextPhase(state);
      expect(following).toBe(run === 4 ? 'longBreak' : 'shortBreak');
      state = beginPhase(state, 'focus', `session-${run}`);
      state.completedRuns = run;
    }
  });

  it('counts only completed focus runs towards the long break', () => {
    let state = settle(start(ready(), T0), at(1500));
    state = beginPhase(state, 'focus', 'session-2');
    state = finishEarly(start(state, T0), at(60));

    expect(state.completedRuns).toBe(1);
    expect(nextPhase(state)).toBe('shortBreak');
  });

  it('never counts a break as focus time or as a completed run', () => {
    const settings = normalizeSettings({ shortBreakSeconds: 300 });
    const breakPhase = settle(start(readyState(settings, 'shortBreak', 'break-1'), T0), at(300));

    expect(breakPhase.status).toBe('finished');
    expect(breakPhase.completedRuns).toBe(0);
    // A break is never uploaded, so it can never reach a total.
    expect(terminalRecord(breakPhase)).toBeNull();
    expect(nextPhase(breakPhase)).toBe('focus');
  });

  it('resets the cycle after a long break', () => {
    let state = settle(start(ready(), T0), at(1500));
    state = { ...state, completedRuns: 4 };
    const long = beginPhase(state, 'longBreak', 'break-long');
    expect(long.completedRuns).toBe(4);

    const afterLong = beginPhase(settle(start(long, T0), at(1500)), 'focus', 'session-next');
    expect(afterLong.completedRuns).toBe(0);
  });

  it('refuses to switch phase while a run is in progress, so nothing is silently discarded', () => {
    const running = start(ready(), T0);
    expect(canSwitchPhase(running)).toBe(false);
    expect(switchPhase(running, 'shortBreak', 'other')).toBe(running);

    const paused = pause(running, at(120));
    expect(canSwitchPhase(paused)).toBe(false);
    expect(switchPhase(paused, 'shortBreak', 'other')).toBe(paused);

    // A timer that has not started may be switched freely.
    const idle = ready();
    expect(canSwitchPhase(idle)).toBe(true);
    expect(switchPhase(idle, 'longBreak', 'other').durationSeconds).toBe(900);
  });
});

describe('the record a finished run uploads', () => {
  it('carries the intervals, the configured duration and the honest outcome', () => {
    const stopped = finishEarly(start(ready({ link: { taskId: 'task-1', title: 'Hesabatı yaz' } }), T0), at(540));

    expect(terminalRecord(stopped)).toEqual({
      clientSessionId: 'session-1',
      taskId: 'task-1',
      taskTitle: 'Hesabatı yaz',
      configuredSeconds: 1500,
      intervals: [{ startedAtUtc: new Date(T0).toISOString(), endedAtUtc: new Date(at(540)).toISOString() }],
      outcome: 'stopped',
    });
  });

  it('has nothing to upload until the phase is over', () => {
    expect(terminalRecord(ready())).toBeNull();
    expect(terminalRecord(start(ready(), T0))).toBeNull();
    expect(terminalRecord(pause(start(ready(), T0), at(60)))).toBeNull();
  });
});

describe('settings', () => {
  it('clamps a configured duration into what the domain will accept', () => {
    expect(clampPhaseSeconds(0)).toBe(60);
    expect(clampPhaseSeconds(10 * 60 * 60)).toBe(4 * 60 * 60);
    expect(clampPhaseSeconds(Number.NaN)).toBe(1500);
    expect(clampPhaseSeconds(25.4 * 60)).toBe(1524);
  });

  it('falls back to the defaults for anything missing or impossible', () => {
    expect(normalizeSettings(undefined)).toEqual(defaultFocusSettings);
    expect(normalizeSettings({ focusSeconds: -5, runsBeforeLongBreak: 99 })).toMatchObject({ focusSeconds: 60, runsBeforeLongBreak: 8 });
  });
});

describe('display helpers', () => {
  it('keeps the countdown two digits either side so the numerals never jump', () => {
    expect(formatCountdown(1500)).toBe('25:00');
    expect(formatCountdown(59.2)).toBe('01:00');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-10)).toBe('00:00');
    expect(formatCountdown(3600)).toBe('60:00');
  });

  it('says a duration in words for summaries and screen readers', () => {
    expect(formatDuration(45)).toBe('45 saniyə');
    expect(formatDuration(1500)).toBe('25 dəqiqə');
    expect(formatDuration(3600)).toBe('1 saat');
    expect(formatDuration(3900)).toBe('1 saat 5 dəqiqə');
    expect(formatDuration(0)).toBe('0 saniyə');
  });
});
