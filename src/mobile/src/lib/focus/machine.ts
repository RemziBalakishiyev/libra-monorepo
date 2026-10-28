/**
 * The Fokus timer, as a pure state machine.
 *
 * Nothing here reads a clock of its own: every function takes the current instant, which is what makes the
 * whole thing testable without waiting through a Pomodoro, and what lets the app reconcile from timestamps
 * after a reload, a backgrounding or a process restart.
 *
 * The source of truth is a list of closed intervals plus the instant the current one started — never a counter
 * that something decremented. A screen may refresh once a second to redraw; it never decides how much time has
 * passed. That distinction is the reason returning after two hours in the background settles the phase at the
 * deadline it actually had, instead of resuming from wherever a counter happened to stop.
 *
 * Device clock changes are not defended against, and this is deliberate: an app cannot tell a corrected clock
 * from a manipulated one. What it does guarantee is that nothing derived is ever impossible — elapsed time is
 * clamped to 0 and to the configured duration, so a clock moved backwards cannot produce negative remaining
 * time and a clock moved forwards cannot produce a run longer than it was configured for. A clock moved
 * forward past the deadline settles the phase as completed, exactly as an hour of real waiting would.
 */

export type FocusPhase = 'focus' | 'shortBreak' | 'longBreak';

export type FocusStatus = 'ready' | 'running' | 'paused' | 'finished';

/** How a finished focus run ended. Breaks are never recorded, so they never carry one. */
export type FocusOutcome = 'completed' | 'stopped';

export interface FocusSettings {
  focusSeconds: number;
  shortBreakSeconds: number;
  longBreakSeconds: number;
  /** Completed focus runs before a long break is offered. */
  runsBeforeLongBreak: number;
}

/** The task a run is attached to, with the title as it read when the run started. */
export interface FocusLink {
  taskId: string;
  title: string;
}

export interface FocusInterval {
  startedAtUtc: string;
  endedAtUtc: string;
}

export interface FocusState {
  status: FocusStatus;
  phase: FocusPhase;
  /** Snapshotted when the phase starts; later settings changes apply to the phases after it. */
  durationSeconds: number;
  /** Stable id for this phase, generated before it starts. The upload key for a focus run. */
  sessionId: string;
  link: FocusLink | null;
  /** Stretches already run in this phase. A pause closes one; a resume opens the next. */
  intervals: FocusInterval[];
  /** When the open stretch started. Non-null exactly when the status is 'running'. */
  runningSinceUtc: string | null;
  /** How the phase ended, once it has. */
  outcome: FocusOutcome | null;
  /** Completed focus runs in the current cycle, 0 … runsBeforeLongBreak. */
  completedRuns: number;
  settings: FocusSettings;
}

export const defaultFocusSettings: FocusSettings = {
  focusSeconds: 25 * 60,
  shortBreakSeconds: 5 * 60,
  longBreakSeconds: 15 * 60,
  runsBeforeLongBreak: 4,
};

/** The compact presets offered before a run; anything else goes through the settings sheet. */
export const focusPresets: readonly number[] = [15 * 60, 25 * 60, 50 * 60];

export const minPhaseSeconds = 60;
export const maxPhaseSeconds = 4 * 60 * 60;

/** Clamps a configured duration into the range the domain accepts, so a stored value can never be impossible. */
export function clampPhaseSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) {
    return defaultFocusSettings.focusSeconds;
  }
  return Math.min(maxPhaseSeconds, Math.max(minPhaseSeconds, Math.round(seconds)));
}

export function normalizeSettings(settings: Partial<FocusSettings> | undefined): FocusSettings {
  return {
    focusSeconds: clampPhaseSeconds(settings?.focusSeconds ?? defaultFocusSettings.focusSeconds),
    shortBreakSeconds: clampPhaseSeconds(settings?.shortBreakSeconds ?? defaultFocusSettings.shortBreakSeconds),
    longBreakSeconds: clampPhaseSeconds(settings?.longBreakSeconds ?? defaultFocusSettings.longBreakSeconds),
    runsBeforeLongBreak: Math.min(8, Math.max(2, Math.round(settings?.runsBeforeLongBreak ?? defaultFocusSettings.runsBeforeLongBreak))),
  };
}

export function phaseSeconds(settings: FocusSettings, phase: FocusPhase): number {
  return phase === 'focus' ? settings.focusSeconds : phase === 'shortBreak' ? settings.shortBreakSeconds : settings.longBreakSeconds;
}

const iso = (ms: number) => new Date(ms).toISOString();

/** A phase waiting to be started. Nothing is running and nothing has been recorded. */
export function readyState(settings: FocusSettings, phase: FocusPhase, sessionId: string, link: FocusLink | null = null): FocusState {
  return {
    status: 'ready',
    phase,
    durationSeconds: phaseSeconds(settings, phase),
    sessionId,
    link,
    intervals: [],
    runningSinceUtc: null,
    outcome: null,
    completedRuns: 0,
    settings,
  };
}

/** Seconds already spent in the closed stretches of this phase. */
function closedSeconds(state: FocusState): number {
  return state.intervals.reduce((total, interval) => total + Math.max(0, (Date.parse(interval.endedAtUtc) - Date.parse(interval.startedAtUtc)) / 1000), 0);
}

/**
 * Time the timer has actually run in this phase, pauses excluded.
 *
 * Clamped to the configured duration: a phase cannot report more focus than it was configured for, however
 * long the app was away or however the device clock moved.
 */
export function elapsedSeconds(state: FocusState, nowMs: number): number {
  const open = state.runningSinceUtc === null ? 0 : Math.max(0, (nowMs - Date.parse(state.runningSinceUtc)) / 1000);
  return Math.min(state.durationSeconds, closedSeconds(state) + open);
}

export function remainingSeconds(state: FocusState, nowMs: number): number {
  return Math.max(0, state.durationSeconds - elapsedSeconds(state, nowMs));
}

/** Share of the phase already spent, 0–1. What the ring draws, and never anything else. */
export function progress(state: FocusState, nowMs: number): number {
  if (state.durationSeconds <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, elapsedSeconds(state, nowMs) / state.durationSeconds));
}

/**
 * The instant the running phase is due to end, or null when nothing is running.
 *
 * This is what a notification is scheduled for and what a later reconciliation settles against, so a phase
 * that expired while the app was closed is recorded as having ended then, not when it was reopened.
 */
export function deadlineMs(state: FocusState): number | null {
  if (state.status !== 'running' || state.runningSinceUtc === null) {
    return null;
  }
  const left = state.durationSeconds - closedSeconds(state);
  return Date.parse(state.runningSinceUtc) + left * 1000;
}

export function start(state: FocusState, nowMs: number, link: FocusLink | null = state.link): FocusState {
  if (state.status !== 'ready') {
    return state;
  }
  return { ...state, status: 'running', link, runningSinceUtc: iso(nowMs) };
}

/** Freezes the remainder by closing the open stretch. The time already spent is kept exactly. */
export function pause(state: FocusState, nowMs: number): FocusState {
  if (state.status !== 'running' || state.runningSinceUtc === null) {
    return state;
  }
  // A pause at or past the deadline is really an expiry; settle it rather than recording a short interval.
  const due = deadlineMs(state);
  if (due !== null && nowMs >= due) {
    return settle(state, nowMs);
  }
  const startedAtUtc = state.runningSinceUtc;
  const endedAtUtc = iso(Math.max(nowMs, Date.parse(startedAtUtc) + 1));
  return { ...state, status: 'paused', runningSinceUtc: null, intervals: [...state.intervals, { startedAtUtc, endedAtUtc }] };
}

/** Continues the remainder that pausing froze. */
export function resume(state: FocusState, nowMs: number): FocusState {
  if (state.status !== 'paused') {
    return state;
  }
  return { ...state, status: 'running', runningSinceUtc: iso(nowMs) };
}

/**
 * Ends a phase early. It keeps the time actually spent and is never a completed run, so it cannot advance the
 * cycle towards a long break.
 */
export function finishEarly(state: FocusState, nowMs: number): FocusState {
  if (state.status !== 'running' && state.status !== 'paused') {
    return state;
  }
  const closed = state.status === 'running' ? pause(state, nowMs) : state;
  // Pausing exactly at the deadline settles the phase as completed; that is the honest outcome, not a stop.
  if (closed.status === 'finished') {
    return closed;
  }
  return { ...closed, status: 'finished', outcome: 'stopped', runningSinceUtc: null };
}

/**
 * Settles a phase whose deadline has passed, once.
 *
 * The final stretch is closed **at the deadline**, not at the moment this was noticed, so reopening the app
 * hours later records the phase exactly as long as it was configured to be. Calling it again changes nothing,
 * which is what makes a notification tap, a foreground event and the display tick racing each other harmless.
 */
export function settle(state: FocusState, nowMs: number): FocusState {
  const due = deadlineMs(state);
  if (due === null || nowMs < due) {
    return state;
  }
  const startedAtUtc = state.runningSinceUtc!;
  const endedAtUtc = iso(Math.max(due, Date.parse(startedAtUtc) + 1));
  const intervals = [...state.intervals, { startedAtUtc, endedAtUtc }];
  return {
    ...state,
    status: 'finished',
    outcome: 'completed',
    runningSinceUtc: null,
    intervals,
    // Only a focus run that ran its whole length advances the cycle.
    completedRuns: state.phase === 'focus' ? state.completedRuns + 1 : state.completedRuns,
  };
}

/** True when the phase has run out and is only waiting to be settled. */
export function hasExpired(state: FocusState, nowMs: number): boolean {
  const due = deadlineMs(state);
  return due !== null && nowMs >= due;
}

/**
 * Which phase follows the one that just finished: a break after a focus run, a focus run after a break.
 * The long break is offered once the cycle's fourth focus run is done.
 */
export function nextPhase(state: FocusState): FocusPhase {
  if (state.phase !== 'focus') {
    return 'focus';
  }
  return state.completedRuns > 0 && state.completedRuns % state.settings.runsBeforeLongBreak === 0 ? 'longBreak' : 'shortBreak';
}

/**
 * Starts the next phase explicitly. Nothing here runs a cycle on its own: the user begins every phase, so the
 * app never manufactures sessions while it is unattended.
 *
 * The cycle counter carries over, and it resets after a long break — the four runs it counts are the four
 * before that break, not since installation.
 */
export function beginPhase(state: FocusState, phase: FocusPhase, sessionId: string, settings: FocusSettings = state.settings, link: FocusLink | null = null): FocusState {
  const completedRuns = state.phase === 'longBreak' ? 0 : state.completedRuns;
  return {
    ...readyState(settings, phase, sessionId, link),
    completedRuns,
  };
}

/**
 * Whether the phase selector may switch away right now.
 *
 * A run in progress is never discarded by a tap on another phase: the caller has to end it first, explicitly.
 */
export function canSwitchPhase(state: FocusState): boolean {
  return state.status === 'ready' || state.status === 'finished';
}

/** Changes the phase of a timer that has not started, snapshotting the new duration. */
export function switchPhase(state: FocusState, phase: FocusPhase, sessionId: string): FocusState {
  if (!canSwitchPhase(state)) {
    return state;
  }
  return { ...readyState(state.settings, phase, sessionId, state.link), completedRuns: state.completedRuns };
}

/** Changes the duration of a phase that has not started yet. A running phase keeps its snapshot. */
export function setDuration(state: FocusState, seconds: number): FocusState {
  if (state.status !== 'ready') {
    return state;
  }
  return { ...state, durationSeconds: clampPhaseSeconds(seconds) };
}

/** The payload a finished focus run uploads. Breaks return null: they are never recorded. */
export interface FocusRecord {
  clientSessionId: string;
  taskId: string | null;
  taskTitle: string | null;
  configuredSeconds: number;
  intervals: FocusInterval[];
  outcome: FocusOutcome;
}

export function terminalRecord(state: FocusState): FocusRecord | null {
  if (state.status !== 'finished' || state.phase !== 'focus' || state.outcome === null || state.intervals.length === 0) {
    return null;
  }
  return {
    clientSessionId: state.sessionId,
    taskId: state.link?.taskId ?? null,
    taskTitle: state.link?.title ?? null,
    configuredSeconds: state.durationSeconds,
    intervals: state.intervals,
    outcome: state.outcome,
  };
}

/** "24:59" — the countdown, always two digits either side so the numerals never jump. */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/** "1 saat 5 dəqiqə", "25 dəqiqə", "40 saniyə" — for summaries and accessible readings, never the countdown. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) {
    return `${whole} saniyə`;
  }
  const minutes = Math.round(whole / 60);
  if (minutes < 60) {
    return `${minutes} dəqiqə`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} saat` : `${hours} saat ${rest} dəqiqə`;
}
