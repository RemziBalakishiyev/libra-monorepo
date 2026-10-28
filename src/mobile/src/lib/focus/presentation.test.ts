import { defaultFocusSettings, finishEarly, pause, readyState, settle, start, type FocusState } from '@/lib/focus/machine';
import { cycleLabel, cycleMarkers, describeFocus } from '@/lib/focus/presentation';

const T0 = Date.parse('2026-10-01T09:00:00.000Z');
const at = (seconds: number) => T0 + seconds * 1000;
const ready = (phase: 'focus' | 'shortBreak' | 'longBreak' = 'focus'): FocusState => readyState(defaultFocusSettings, phase, 'session-1');
const describe_ = (state: FocusState | null, now = T0) => describeFocus(state, defaultFocusSettings, now);

describe('a focus phase that has not started', () => {
  it('shows the configured length as a countdown and offers to start', () => {
    const view = describe_(ready());

    expect(view).toMatchObject({
      kind: 'ready',
      figure: '25:00',
      figureKind: 'clock',
      figureLabel: 'qalıb',
      title: 'Fokusa hazır',
      primaryAction: 'start',
      primaryLabel: 'Başla',
      showStop: false,
      celebrate: false,
      ambient: false,
      progress: 0,
    });
  });

  it('describes a timer that does not exist yet from the settings alone', () => {
    expect(describe_(null)).toMatchObject({ kind: 'ready', figure: '25:00', primaryAction: 'start' });
  });
});

describe('a focus phase counting down', () => {
  it('counts down, offers a pause and a distinct stop, and lets the scene move', () => {
    const view = describe_(start(ready(), T0), at(300));

    expect(view).toMatchObject({
      kind: 'running',
      figure: '20:00',
      title: 'Fokus',
      primaryAction: 'pause',
      primaryLabel: 'Pauza',
      // Stopping the session is a separate control, never the same button as pausing.
      showStop: true,
      ambient: true,
    });
    expect(view.progress).toBeCloseTo(0.2, 5);
  });
});

describe('a paused focus phase', () => {
  it('says so, freezes the scene, and keeps the frozen remainder', () => {
    const paused = pause(start(ready(), T0), at(600));
    const view = describe_(paused, at(5000));

    expect(view).toMatchObject({
      kind: 'paused',
      // An hour later the figure is still what it was when the pause happened.
      figure: '15:00',
      title: 'Pauzadadır',
      primaryAction: 'resume',
      primaryLabel: 'Davam et',
      showStop: true,
      ambient: false,
      celebrate: false,
    });
  });
});

describe('a focus run stopped early', () => {
  const stopped = finishEarly(start(ready(), T0), at(2));

  it('leads with the time actually focused, never the time that was left', () => {
    const view = describe_(stopped, at(9999));

    expect(view.kind).toBe('stopped');
    // The defect this replaces: "24:59" as the headline of a session that is over.
    expect(view.figure).toBe('2 saniyə');
    expect(view.figure).not.toMatch(/24:/);
    expect(view.figureLabel).toBe('fokuslanmış vaxt');
    // A spelled-out result is typed differently from a clock, or it overflows the ring it sits in.
    expect(view.figureKind).toBe('duration');
    expect(view.title).toBe('Sessiya dayandırıldı');
    // The configured length is the context; it is not presented as time still waiting.
    expect(view.detail).toBe('Planlaşdırılan: 25 dəqiqə');
  });

  it('is never celebrated and offers focusing again as the primary action', () => {
    const view = describe_(stopped);

    expect(view.celebrate).toBe(false);
    expect(view.primaryAction).toBe('restart');
    expect(view.primaryLabel).toBe('Yenidən fokuslan');
    // Nothing is running any more, so there is nothing to stop.
    expect(view.showStop).toBe(false);
    expect(view.ambient).toBe(false);
  });

  it('does not advance the cycle or light a marker', () => {
    expect(cycleMarkers(stopped, defaultFocusSettings).filter((marker) => marker.filled)).toHaveLength(0);
    expect(cycleLabel(stopped, defaultFocusSettings)).toBe('0 / 4 tamamlanmış fokus');
  });
});

describe('a focus run that completed naturally', () => {
  const completed = settle(start(ready(), T0), at(1500));

  it('leads with the completed duration and offers the break', () => {
    const view = describe_(completed, at(9999));

    expect(view).toMatchObject({
      kind: 'completed',
      figure: '25 dəqiqə',
      figureKind: 'duration',
      figureLabel: 'tamamlanmış fokus',
      title: 'Fokus tamamlandı',
      detail: null,
      progress: 1,
      primaryAction: 'advance',
      primaryLabel: 'Fasiləyə başla',
      showStop: false,
    });
  });

  it('is the only state that celebrates', () => {
    expect(describe_(completed).celebrate).toBe(true);
    expect(describe_(finishEarly(start(ready(), T0), at(60))).celebrate).toBe(false);
  });

  it('advances the cycle by exactly one marker', () => {
    expect(cycleMarkers(completed, defaultFocusSettings).map((marker) => marker.filled)).toEqual([true, false, false, false]);
    expect(cycleLabel(completed, defaultFocusSettings)).toBe('1 / 4 tamamlanmış fokus');
  });
});

describe('a break', () => {
  it('is its own presentation in every state, and is never focus', () => {
    const readyBreak = describe_(ready('shortBreak'));
    expect(readyBreak).toMatchObject({ kind: 'break', figure: '05:00', title: 'Qısa fasilə', primaryLabel: 'Fasiləyə başla' });

    const running = describe_(start(ready('shortBreak'), T0), at(60));
    expect(running).toMatchObject({ kind: 'break', title: 'Qısa fasilə', primaryLabel: 'Pauza', ambient: true });

    const done = describe_(settle(start(ready('shortBreak'), T0), at(300)), at(400));
    expect(done).toMatchObject({ kind: 'break', title: 'Fasilə bitdi', primaryAction: 'advance', primaryLabel: 'Fokusa başla', celebrate: false });
    expect(done.figure).toBe('5 dəqiqə');
  });

  it('never lights a cycle marker', () => {
    const done = settle(start(ready('shortBreak'), T0), at(300));
    expect(cycleMarkers(done, defaultFocusSettings).some((marker) => marker.filled || marker.active)).toBe(false);
  });

  it('names the long break with its own words', () => {
    expect(describe_(ready('longBreak'))).toMatchObject({ kind: 'break', title: 'Uzun fasilə', figure: '15:00' });
  });
});

describe('the cycle markers', () => {
  it('mark the run under way only while it is actually under way', () => {
    expect(cycleMarkers(start(ready(), T0), defaultFocusSettings)[0]).toEqual({ filled: false, active: true });
    // Ready is not under way, and neither is a session that has ended.
    expect(cycleMarkers(ready(), defaultFocusSettings)[0]).toEqual({ filled: false, active: false });
    expect(cycleMarkers(finishEarly(start(ready(), T0), at(30)), defaultFocusSettings)[0]).toEqual({ filled: false, active: false });
  });

  it('start the next cycle over once four runs are done', () => {
    const fourDone = { ...ready(), completedRuns: 4 };
    expect(cycleMarkers(fourDone, defaultFocusSettings).every((marker) => marker.filled)).toBe(true);
    expect(cycleLabel(fourDone, defaultFocusSettings)).toBe('4 / 4 tamamlanmış fokus');

    const fifth = { ...ready(), completedRuns: 5 };
    expect(cycleMarkers(fifth, defaultFocusSettings).filter((marker) => marker.filled)).toHaveLength(1);
  });
});

describe('the spoken summary', () => {
  it('is one sentence about the state, not a number that changes every second', () => {
    expect(describe_(start(ready(), T0), at(300)).spoken).toBe('Fokus, 20 dəqiqə qalıb');
    expect(describe_(pause(start(ready(), T0), at(600))).spoken).toBe('Pauzadadır, 15 dəqiqə qalıb');
    expect(describe_(settle(start(ready(), T0), at(1500))).spoken).toBe('Fokus tamamlandı, 25 dəqiqə');
    expect(describe_(finishEarly(start(ready(), T0), at(2))).spoken).toBe('Sessiya dayandırıldı, 2 saniyə fokuslanmış vaxt');
  });
});
