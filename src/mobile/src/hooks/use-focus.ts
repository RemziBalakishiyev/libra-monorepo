import { useEffect } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { focusApi, type SaveFocusSessionInput } from '@/lib/api/focus';
import { newClientRequestId } from '@/lib/client-request-id';
import {
  beginPhase,
  canSwitchPhase,
  defaultFocusSettings,
  deadlineMs,
  finishEarly,
  hasExpired,
  nextPhase,
  pause,
  readyState,
  resume,
  setDuration,
  settle,
  start,
  switchPhase,
  terminalRecord,
  type FocusLink,
  type FocusPhase,
  type FocusSettings,
  type FocusState,
} from '@/lib/focus/machine';
import { cancelFocusNotification, scheduleFocusNotification } from '@/lib/focus/notification';
import { acknowledgeRecord, clearTimer, enqueueRecord, noteAttempt, readOutbox, readSettings, readTimer, subscribeToOtherTabs, writeSettings, writeTimer } from '@/lib/focus/storage';

/**
 * The single Fokus timer for the signed-in account on this installation.
 *
 * It is a store rather than component state because the timer outlives every screen: minimising the Focus
 * screen, moving to another tab or navigating anywhere else leaves it running. Nothing here counts seconds —
 * the state machine derives everything from stored instants, and a one-second tick exists only to make the
 * countdown redraw.
 *
 * Every transition does the same three things in the same order: settle anything that expired, apply the
 * change, then persist and reschedule. Persisting happens on transitions only, never on a tick.
 */

interface FocusStore {
  /** The account this timer belongs to. A different id means the stored timer is not ours. */
  userId: string | null;
  state: FocusState | null;
  settings: FocusSettings;
  /** Bumped every second while something runs, so subscribed screens redraw. */
  tick: number;
  /** The instant the store last looked at the clock. Screens read this rather than calling the clock in render. */
  nowMs: number;
  hydrated: boolean;
  /** How many finished runs are waiting to be uploaded. */
  pending: number;
  /** True while a terminal record is being written, so a double tap cannot queue twice. */
  busy: boolean;
}

const useStore = create<FocusStore>(() => ({
  userId: null,
  state: null,
  settings: defaultFocusSettings,
  tick: 0,
  nowMs: Date.now(),
  hydrated: false,
  pending: 0,
  busy: false,
}));

let ticker: ReturnType<typeof setInterval> | null = null;
/** The upload pass currently running, so a second caller joins it instead of starting a competing one. */
let syncing: Promise<void> | null = null;

const now = () => Date.now();
const newSessionId = (): string => newClientRequestId();

function runningPhase(state: FocusState | null): boolean {
  return state?.status === 'running';
}

/** Starts or stops the display tick. It refreshes the screen; it never decides how much time has passed. */
function syncTicker(): void {
  const running = runningPhase(useStore.getState().state);
  if (running && ticker === null) {
    ticker = setInterval(() => {
      const state = useStore.getState().state;
      // The tick is also where an expiry noticed while the screen is open gets settled, exactly once.
      if (state && hasExpired(state, now())) {
        void applySettled();
      }
      useStore.setState((current) => ({ tick: current.tick + 1, nowMs: now() }));
    }, 1000);
  } else if (!running && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

/** Persists the state and brings the scheduled notification into line with it. */
async function commit(state: FocusState | null): Promise<void> {
  const { userId } = useStore.getState();
  useStore.setState({ state, nowMs: now() });
  syncTicker();
  if (!userId) {
    return;
  }

  if (state === null) {
    await Promise.all([clearTimer(userId), cancelFocusNotification()]);
    return;
  }

  await writeTimer(userId, state);
  const due = deadlineMs(state);
  if (due === null) {
    // Nothing is running: pause, end and phase change all cancel the alarm rather than leaving it to fire.
    await cancelFocusNotification();
    return;
  }
  await scheduleFocusNotification(userId, state.sessionId, state.phase, due);
}

/**
 * Records a finished focus run in the outbox before anything is sent, then tries to upload it.
 *
 * The record is durable first and uploaded second, so a run survives a closed app, a dead connection or an
 * expired token. Breaks produce no record at all.
 */
async function persistTerminal(state: FocusState): Promise<void> {
  const record = terminalRecord(state);
  const { userId } = useStore.getState();
  if (!record || !userId) {
    return;
  }
  await enqueueRecord(userId, record, new Date().toISOString());
  useStore.setState({ pending: (await readOutbox(userId)).length });
  void flushOutbox();
}

/** Settles an expired phase once, persists the run it produced, and leaves the result on screen. */
async function applySettled(): Promise<void> {
  const { state, busy } = useStore.getState();
  if (!state || busy || !hasExpired(state, now())) {
    return;
  }
  useStore.setState({ busy: true });
  try {
    const settled = settle(state, now());
    if (settled === state) {
      return;
    }
    await commit(settled);
    await persistTerminal(settled);
  } finally {
    useStore.setState({ busy: false });
  }
}

/** Uploads everything pending for this account, one record at a time, and keeps what it cannot send. */
function flushOutbox(): Promise<void> {
  const { userId } = useStore.getState();
  if (!userId) {
    return Promise.resolve();
  }
  // A second caller waits for the pass already running rather than sending the same records alongside it.
  syncing ??= uploadPending(userId).finally(() => {
    syncing = null;
  });
  return syncing;
}

async function uploadPending(userId: string): Promise<void> {
  {
    for (const record of await readOutbox(userId)) {
      const input: SaveFocusSessionInput = {
        clientSessionId: record.clientSessionId,
        taskId: record.taskId,
        taskTitle: record.taskTitle,
        configuredSeconds: record.configuredSeconds,
        intervals: record.intervals,
        outcome: record.outcome === 'completed' ? 'Completed' : 'Stopped',
      };
      try {
        await focusApi.save(input);
        // The server is idempotent on the client id, so acknowledging a replay is the same as a first write.
        await acknowledgeRecord(userId, record.clientSessionId);
      } catch {
        // Offline, unauthenticated or refused: the record stays and is tried again later.
        await noteAttempt(userId, record.clientSessionId);
      }
    }
    useStore.setState({ pending: (await readOutbox(userId)).length });
  }
}

export const focusTimer = {
  /**
   * Adopts the account's stored timer. Called when the signed-in user is known and whenever it changes; a
   * timer stored for somebody else is left alone rather than inherited.
   */
  async hydrate(userId: string | undefined): Promise<void> {
    const current = useStore.getState().userId;
    if (!userId) {
      if (current) {
        // Signing out: the local phase is paused and its alarm cancelled, never carried into another account.
        await focusTimer.releaseForSignOut();
      }
      useStore.setState({ userId: null, state: null, hydrated: true, pending: 0 });
      syncTicker();
      return;
    }
    if (current === userId && useStore.getState().hydrated) {
      return;
    }

    const [stored, settings, pending] = await Promise.all([readTimer(userId), readSettings(userId), readOutbox(userId)]);
    useStore.setState({ userId, settings, hydrated: true, pending: pending.length });

    // Reconcile from the stored instants: an expired phase is settled at its own deadline, and a running one
    // keeps running from where it really is — never reset to its configured duration.
    if (stored && hasExpired(stored, now())) {
      const settled = settle(stored, now());
      await commit(settled);
      await persistTerminal(settled);
    } else {
      await commit(stored);
    }
    void flushOutbox();
  },

  /** Pauses the running phase and cancels its alarm without discarding what was spent. */
  async releaseForSignOut(): Promise<void> {
    const { state, userId } = useStore.getState();
    if (userId && state && state.status === 'running') {
      const paused = pause(state, now());
      await writeTimer(userId, paused);
      if (paused.status === 'finished') {
        await persistTerminal(paused);
      }
    }
    await cancelFocusNotification();
    useStore.setState({ state: null, userId: null, pending: 0 });
    syncTicker();
  },

  /** Prepares a phase that has not started. Refused while something is running, so nothing is discarded. */
  async prepare(phase: FocusPhase, link: FocusLink | null = null): Promise<void> {
    const { state, settings } = useStore.getState();
    if (state && !canSwitchPhase(state)) {
      return;
    }
    const base = state ? switchPhase(state, phase, newSessionId()) : readyState(settings, phase, newSessionId());
    await commit({ ...base, link: link ?? base.link });
  },

  async setDuration(seconds: number): Promise<void> {
    const { state } = useStore.getState();
    if (state) {
      await commit(setDuration(state, seconds));
    }
  },

  async setLink(link: FocusLink | null): Promise<void> {
    const { state } = useStore.getState();
    if (state && state.status === 'ready') {
      await commit({ ...state, link });
    }
  },

  async start(link?: FocusLink | null): Promise<void> {
    const { state, settings, busy } = useStore.getState();
    // A phase already under way is never replaced by a second tap: the running one keeps its intervals,
    // its id and its deadline. Only a timer with nothing under way can be started.
    if (busy || state?.status === 'running' || state?.status === 'paused') {
      return;
    }
    const base = state ?? readyState(settings, 'focus', newSessionId());
    const ready = base.status === 'finished' ? beginPhase(base, base.phase, newSessionId(), settings, link ?? base.link) : base;
    if (ready.status !== 'ready') {
      return;
    }
    await commit(start(ready, now(), link ?? ready.link));
  },

  async pause(): Promise<void> {
    const { state } = useStore.getState();
    if (!state || state.status !== 'running') {
      return;
    }
    const paused = pause(state, now());
    await commit(paused);
    // Pausing at the deadline settles the phase instead; that run still has to be recorded.
    if (paused.status === 'finished') {
      await persistTerminal(paused);
    }
  },

  async resume(): Promise<void> {
    const { state } = useStore.getState();
    if (state?.status === 'paused') {
      await commit(resume(state, now()));
    }
  },

  /** Ends the phase early. The caller asks for confirmation first; this does the recording. */
  async finish(): Promise<void> {
    const { state, busy } = useStore.getState();
    if (!state || busy || (state.status !== 'running' && state.status !== 'paused')) {
      return;
    }
    useStore.setState({ busy: true });
    try {
      const finished = finishEarly(state, now());
      await commit(finished);
      await persistTerminal(finished);
    } finally {
      useStore.setState({ busy: false });
    }
  },

  /** Begins the phase the finished one leads to. Always an explicit choice: nothing auto-runs a cycle. */
  async advance(): Promise<void> {
    const { state, settings } = useStore.getState();
    if (state?.status !== 'finished') {
      return;
    }
    const following = nextPhase(state);
    // A break carries no task; the next focus run keeps the one the finished run had.
    await commit(beginPhase(state, following, newSessionId(), settings, following === 'focus' ? state.link : null));
  },

  async saveSettings(settings: FocusSettings): Promise<void> {
    const { userId, state } = useStore.getState();
    useStore.setState({ settings });
    if (userId) {
      await writeSettings(userId, settings);
    }
    // A phase that has not started picks up the new duration; a running one keeps the snapshot it began with.
    if (state?.status === 'ready') {
      await commit({ ...state, settings, durationSeconds: settings[state.phase === 'focus' ? 'focusSeconds' : state.phase === 'shortBreak' ? 'shortBreakSeconds' : 'longBreakSeconds'] });
    }
  },

  /** Settles anything that expired while the app was away and retries the outbox. */
  async reconcile(): Promise<void> {
    await applySettled();
    void flushOutbox();
  },

  flush: flushOutbox,
};

/** Subscribes a screen to the timer. The tick is what makes the countdown redraw once a second. */
export function useFocusTimer() {
  const store = useStore();

  useEffect(() => {
    // Returning to the foreground is one of the two moments an expired phase gets settled; the other is the
    // tick while the screen is open. Both go through the same idempotent path.
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void focusTimer.reconcile();
      }
    });
    const unsubscribe = subscribeToOtherTabs(() => {
      const { userId } = useStore.getState();
      if (userId) {
        void readTimer(userId).then((stored) => {
          // Another tab changed the shared timer: follow it rather than run a second countdown.
          useStore.setState({ state: stored });
          syncTicker();
        });
      }
    });
    return () => {
      subscription.remove();
      unsubscribe();
    };
  }, []);

  return store;
}

/** Test-only reset, so one suite's timer never leaks into the next. */
export function __resetFocusStore(): void {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
  syncing = null;
  useStore.setState({ userId: null, state: null, settings: defaultFocusSettings, tick: 0, nowMs: Date.now(), hydrated: false, pending: 0, busy: false });
}
