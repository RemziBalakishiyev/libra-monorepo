import { elapsedSeconds, formatCountdown, formatDuration, phaseSeconds, remainingSeconds, type FocusPhase, type FocusSettings, type FocusState } from '@/lib/focus/machine';

/**
 * What the Fokus scene says, for each of the six states it can be in.
 *
 * This exists because the states were being conflated: a session stopped after two seconds showed the
 * countdown's *remaining* time as its headline figure ("24:59") next to a status of "Bitdi" and a result of
 * "Vaxtından əvvəl bitirildi". Three different readings of one moment. Deciding the whole presentation in one
 * pure function makes that impossible — a finished session's figure is what it achieved, never what was left.
 *
 * Nothing here reads a clock or mutates anything; the caller passes the instant it is rendering for.
 */

export type FocusPresentationKind =
  /** A focus phase that has not started. */
  | 'ready'
  /** A focus phase counting down. */
  | 'running'
  /** A focus phase frozen mid-run. */
  | 'paused'
  /** A focus run that reached its configured duration. */
  | 'completed'
  /** A focus run the user ended early. Never celebrated, never counted. */
  | 'stopped'
  /** Any state of a short or long break. */
  | 'break';

export type FocusAction = 'start' | 'pause' | 'resume' | 'advance' | 'restart';

export interface FocusPresentation {
  kind: FocusPresentationKind;
  /** The largest thing on screen: a countdown while time is passing, an achievement once it is not. */
  figure: string;
  /**
   * Whether the figure is a clock ("24:59") or a spelled-out duration ("25 dəqiqə"). They need different
   * type sizes: a duration set at the countdown's size overflows the ring it sits inside.
   */
  figureKind: 'clock' | 'duration';
  /** What that figure is, said in words for a screen reader and printed beneath it. */
  figureLabel: string;
  title: string;
  detail: string | null;
  /** Share of the phase spent, 0–1. The ring never disagrees with the figure. */
  progress: number;
  /** A completed focus run earns a brief celebration. Stopping early never does. */
  celebrate: boolean;
  primaryAction: FocusAction;
  primaryLabel: string;
  /** "Sessiyanı dayandır" — only while something is actually running. */
  showStop: boolean;
  /** Whether the ambient scene should be moving. */
  ambient: boolean;
  /** One sentence for assistive technology, replacing a per-second reading. */
  spoken: string;
}

const phaseTitles: Record<FocusPhase, string> = {
  focus: 'Fokus',
  shortBreak: 'Qısa fasilə',
  longBreak: 'Uzun fasilə',
};

/** The figure and label a phase shows while time is still passing. */
function countdownFigure(seconds: number): Pick<FocusPresentation, 'figure' | 'figureKind' | 'figureLabel'> {
  return { figure: formatCountdown(seconds), figureKind: 'clock', figureLabel: 'qalıb' };
}

export function describeFocus(state: FocusState | null, settings: FocusSettings, nowMs: number): FocusPresentation {
  const phase: FocusPhase = state?.phase ?? 'focus';
  const isBreak = phase !== 'focus';
  const duration = state?.durationSeconds ?? phaseSeconds(settings, phase);
  const status = state?.status ?? 'ready';
  const left = state ? remainingSeconds(state, nowMs) : duration;
  const spent = state ? elapsedSeconds(state, nowMs) : 0;
  const share = duration <= 0 ? 0 : Math.min(1, Math.max(0, spent / duration));

  // ── A break, in any of its states. It is never focus time and never counts towards the cycle. ──────────
  if (isBreak) {
    const done = status === 'finished';
    return {
      kind: 'break',
      ...(done ? { figure: formatDuration(spent), figureKind: 'duration' as const, figureLabel: 'fasilə' } : countdownFigure(left)),
      title: done ? 'Fasilə bitdi' : status === 'paused' ? 'Pauzadadır' : phaseTitles[phase],
      detail: done ? 'Hazır olanda növbəti fokusa başlayın.' : null,
      progress: done ? 1 : share,
      celebrate: false,
      primaryAction: done ? 'advance' : status === 'running' ? 'pause' : status === 'paused' ? 'resume' : 'start',
      primaryLabel: done ? 'Fokusa başla' : status === 'running' ? 'Pauza' : status === 'paused' ? 'Davam et' : 'Fasiləyə başla',
      showStop: status === 'running' || status === 'paused',
      ambient: status === 'running',
      spoken: done ? 'Fasilə bitdi' : `${phaseTitles[phase]}, ${formatDuration(left)} qalıb`,
    };
  }

  // ── A finished focus run. The headline is what it achieved; the time that was left is not the point. ───
  if (status === 'finished') {
    const completed = state?.outcome === 'completed';
    return {
      kind: completed ? 'completed' : 'stopped',
      figure: formatDuration(spent),
      figureKind: 'duration',
      figureLabel: completed ? 'tamamlanmış fokus' : 'fokuslanmış vaxt',
      title: completed ? 'Fokus tamamlandı' : 'Sessiya dayandırıldı',
      // For a stopped run the configured length is the only context worth keeping: it says what the
      // two seconds were two seconds *of*, without pretending the rest is still waiting.
      detail: completed ? null : `Planlaşdırılan: ${formatDuration(duration)}`,
      progress: completed ? 1 : share,
      // Only a run that went the distance is celebrated. Stopping early is reported, plainly.
      celebrate: completed,
      primaryAction: completed ? 'advance' : 'restart',
      primaryLabel: completed ? 'Fasiləyə başla' : 'Yenidən fokuslan',
      showStop: false,
      ambient: false,
      spoken: completed ? `Fokus tamamlandı, ${formatDuration(spent)}` : `Sessiya dayandırıldı, ${formatDuration(spent)} fokuslanmış vaxt`,
    };
  }

  // ── A focus phase that is ready, running or paused. ────────────────────────────────────────────────────
  const paused = status === 'paused';
  return {
    kind: status === 'running' ? 'running' : paused ? 'paused' : 'ready',
    ...countdownFigure(left),
    title: paused ? 'Pauzadadır' : status === 'running' ? 'Fokus' : 'Fokusa hazır',
    detail: status === 'ready' ? null : null,
    progress: share,
    celebrate: false,
    primaryAction: status === 'running' ? 'pause' : paused ? 'resume' : 'start',
    primaryLabel: status === 'running' ? 'Pauza' : paused ? 'Davam et' : 'Başla',
    showStop: status === 'running' || paused,
    // Ambient light moves only while time is actually passing; a pause freezes the scene with it.
    ambient: status === 'running',
    spoken: paused ? `Pauzadadır, ${formatDuration(left)} qalıb` : `${phaseTitles[phase]}, ${formatDuration(left)} qalıb`,
  };
}

/**
 * The four cycle markers.
 *
 * `filled` counts the completed focus runs of the current cycle, and `active` is the one under way — drawn
 * only while a focus phase is actually running, because a marker that lit up for a session the user stopped
 * would be claiming a Pomodoro that never happened.
 */
export function cycleMarkers(state: FocusState | null, settings: FocusSettings): { filled: boolean; active: boolean }[] {
  const total = settings.runsBeforeLongBreak;
  const done = state?.completedRuns ?? 0;
  const filled = done % total === 0 && done > 0 ? total : done % total;
  const running = state?.phase === 'focus' && (state.status === 'running' || state.status === 'paused');
  return Array.from({ length: total }, (_, index) => ({
    filled: index < filled,
    active: running && index === filled,
  }));
}

/** "2 / 4 tamamlanmış fokus" — the readable count beside the markers. */
export function cycleLabel(state: FocusState | null, settings: FocusSettings): string {
  const total = settings.runsBeforeLongBreak;
  const done = state?.completedRuns ?? 0;
  const filled = done % total === 0 && done > 0 ? total : done % total;
  return `${filled} / ${total} tamamlanmış fokus`;
}
