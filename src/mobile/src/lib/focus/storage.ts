import { Platform } from 'react-native';

import { secureStorage } from '@/lib/secure-storage';
import { normalizeSettings, type FocusRecord, type FocusSettings, type FocusState } from '@/lib/focus/machine';

/**
 * Where the Fokus timer lives between renders, reloads and process restarts.
 *
 * Everything is namespaced by the signed-in account. One installation runs one timer for one account: signing
 * in as somebody else never inherits the other account's running phase, and a pending record is never uploaded
 * under the wrong bearer token.
 *
 * Writes are serialized through a single chain per key. Two transitions arriving together (a tap and a
 * foreground event, say) would otherwise read-modify-write the same stored object and lose one of them.
 */

const TIMER_KEY = 'libra.focus.timer';
const OUTBOX_KEY = 'libra.focus.outbox';
const SETTINGS_KEY = 'libra.focus.settings';

/** The stored timer: the state, and the account it belongs to. */
interface StoredTimer {
  userId: string;
  state: FocusState;
}

/** A finished run waiting to be uploaded, with what is known about the attempts so far. */
export interface PendingRecord extends FocusRecord {
  /** When the run finished, so an old pending record can be reported honestly. */
  finishedAtUtc: string;
  attempts: number;
}

let chain: Promise<unknown> = Promise.resolve();

/** Runs storage work one operation at a time, so concurrent transitions cannot overwrite each other. */
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => undefined);
  return next;
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await secureStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    if (value === null) {
      await secureStorage.deleteItem(key);
      return;
    }
    await secureStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A device that refuses to persist leaves the in-memory timer working; it just cannot survive a restart.
  }
}

/** The stored phase for this account, or null when there is none — including one stored for somebody else. */
export async function readTimer(userId: string | undefined): Promise<FocusState | null> {
  if (!userId) {
    return null;
  }
  const stored = await readJson<StoredTimer>(TIMER_KEY);
  if (!stored || stored.userId !== userId || !isFocusState(stored.state)) {
    return null;
  }
  return { ...stored.state, settings: normalizeSettings(stored.state.settings) };
}

export function writeTimer(userId: string, state: FocusState | null): Promise<void> {
  return serialize(() => writeJson(TIMER_KEY, state === null ? null : ({ userId, state } satisfies StoredTimer)));
}

/** Forgets the stored phase, but only if it belongs to this account. */
export function clearTimer(userId: string | undefined): Promise<void> {
  return serialize(async () => {
    const stored = await readJson<StoredTimer>(TIMER_KEY);
    if (stored && (!userId || stored.userId === userId)) {
      await writeJson(TIMER_KEY, null);
    }
  });
}

export async function readSettings(userId: string | undefined): Promise<FocusSettings> {
  const stored = await readJson<Record<string, FocusSettings>>(SETTINGS_KEY);
  return normalizeSettings(userId ? stored?.[userId] : undefined);
}

export function writeSettings(userId: string, settings: FocusSettings): Promise<void> {
  return serialize(async () => {
    const stored = (await readJson<Record<string, FocusSettings>>(SETTINGS_KEY)) ?? {};
    await writeJson(SETTINGS_KEY, { ...stored, [userId]: normalizeSettings(settings) });
  });
}

export async function readOutbox(userId: string | undefined): Promise<PendingRecord[]> {
  if (!userId) {
    return [];
  }
  const stored = await readJson<Record<string, PendingRecord[]>>(OUTBOX_KEY);
  const mine = stored?.[userId];
  return Array.isArray(mine) ? mine.filter(isPendingRecord) : [];
}

/**
 * Puts a finished run in the outbox before anything is sent.
 *
 * The record is keyed by the id the phase was given before it started, so re-queueing the same run replaces
 * its entry rather than adding a second one — and the server's unique index makes the upload itself safe to
 * repeat for the same reason.
 */
export function enqueueRecord(userId: string, record: FocusRecord, finishedAtUtc: string): Promise<void> {
  return serialize(async () => {
    const stored = (await readJson<Record<string, PendingRecord[]>>(OUTBOX_KEY)) ?? {};
    const mine = (stored[userId] ?? []).filter((entry) => entry.clientSessionId !== record.clientSessionId);
    await writeJson(OUTBOX_KEY, { ...stored, [userId]: [...mine, { ...record, finishedAtUtc, attempts: 0 }] });
  });
}

/** Retires a record the server has acknowledged. Anything still pending is left exactly as it was. */
export function acknowledgeRecord(userId: string, clientSessionId: string): Promise<void> {
  return serialize(async () => {
    const stored = (await readJson<Record<string, PendingRecord[]>>(OUTBOX_KEY)) ?? {};
    const mine = (stored[userId] ?? []).filter((entry) => entry.clientSessionId !== clientSessionId);
    await writeJson(OUTBOX_KEY, { ...stored, [userId]: mine });
  });
}

/**
 * Notes a failed attempt. The record stays: a connection that is down, or a token that has expired, is a
 * reason to try again later, never a reason to drop the time somebody actually spent.
 */
export function noteAttempt(userId: string, clientSessionId: string): Promise<void> {
  return serialize(async () => {
    const stored = (await readJson<Record<string, PendingRecord[]>>(OUTBOX_KEY)) ?? {};
    const mine = (stored[userId] ?? []).map((entry) => (entry.clientSessionId === clientSessionId ? { ...entry, attempts: entry.attempts + 1 } : entry));
    await writeJson(OUTBOX_KEY, { ...stored, [userId]: mine });
  });
}

/**
 * Watches for another browser tab changing the stored timer.
 *
 * Two tabs of the web build share one origin and therefore one stored phase. Without this, each would run its
 * own countdown from its own copy and the last one to write would win. With it, a tab that did not make the
 * change re-reads the stored state and follows it, so the account still has exactly one timer.
 *
 * There is no equivalent on native — one installation is one process — and none is needed.
 */
export function subscribeToOtherTabs(onChange: () => void): () => void {
  if (Platform.OS !== 'web' || typeof globalThis.addEventListener !== 'function') {
    return () => undefined;
  }
  const listener = (event: Event) => {
    if ((event as StorageEvent).key === TIMER_KEY) {
      onChange();
    }
  };
  globalThis.addEventListener('storage', listener);
  return () => globalThis.removeEventListener('storage', listener);
}

function isFocusState(value: unknown): value is FocusState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const state = value as Partial<FocusState>;
  return (
    (state.status === 'ready' || state.status === 'running' || state.status === 'paused' || state.status === 'finished')
    && (state.phase === 'focus' || state.phase === 'shortBreak' || state.phase === 'longBreak')
    && typeof state.durationSeconds === 'number'
    && typeof state.sessionId === 'string'
    && Array.isArray(state.intervals)
  );
}

function isPendingRecord(value: unknown): value is PendingRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Partial<PendingRecord>;
  return typeof record.clientSessionId === 'string' && typeof record.configuredSeconds === 'number' && Array.isArray(record.intervals) && record.intervals.length > 0;
}
