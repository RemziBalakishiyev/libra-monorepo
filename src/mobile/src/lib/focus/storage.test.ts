import { defaultFocusSettings, finishEarly, pause, readyState, settle, start, terminalRecord } from '@/lib/focus/machine';
import { acknowledgeRecord, clearTimer, enqueueRecord, noteAttempt, readOutbox, readSettings, readTimer, writeSettings, writeTimer } from '@/lib/focus/storage';
import { secureStorage } from '@/lib/secure-storage';

const T0 = Date.parse('2026-09-30T09:00:00.000Z');
const at = (seconds: number) => T0 + seconds * 1000;
const ALICE = 'user-alice';
const BOB = 'user-bob';

/** The real storage module, backed by the browser localStorage the test environment provides. */
beforeEach(async () => {
  for (const key of ['libra.focus.timer', 'libra.focus.outbox', 'libra.focus.settings']) {
    await secureStorage.deleteItem(key);
  }
});

describe('the stored timer', () => {
  it('survives a process restart and is reconciled from its timestamps, not reset', async () => {
    const running = start(readyState(defaultFocusSettings, 'focus', 'session-1'), T0);
    await writeTimer(ALICE, running);

    // A new process reads it back and settles it against the real clock.
    const restored = await readTimer(ALICE);
    expect(restored).not.toBeNull();
    expect(restored!.status).toBe('running');
    expect(restored!.runningSinceUtc).toBe(new Date(T0).toISOString());

    const settled = settle(restored!, at(7200));
    expect(settled.outcome).toBe('completed');
    expect(settled.intervals.at(-1)!.endedAtUtc).toBe(new Date(at(1500)).toISOString());
  });

  it('belongs to one account: another account sees nothing', async () => {
    await writeTimer(ALICE, start(readyState(defaultFocusSettings, 'focus', 'session-1'), T0));

    expect(await readTimer(ALICE)).not.toBeNull();
    // Bob signing in on the same installation must never inherit Alice's running phase.
    expect(await readTimer(BOB)).toBeNull();
    expect(await readTimer(undefined)).toBeNull();
  });

  it('is only cleared by the account that owns it', async () => {
    await writeTimer(ALICE, start(readyState(defaultFocusSettings, 'focus', 'session-1'), T0));

    await clearTimer(BOB);
    expect(await readTimer(ALICE)).not.toBeNull();

    await clearTimer(ALICE);
    expect(await readTimer(ALICE)).toBeNull();
  });

  it('refuses a stored value that is not a timer rather than restoring nonsense', async () => {
    await secureStorage.setItem('libra.focus.timer', JSON.stringify({ userId: ALICE, state: { status: 'spinning' } }));

    expect(await readTimer(ALICE)).toBeNull();
  });

  it('keeps concurrent writes from overwriting one another', async () => {
    const base = readyState(defaultFocusSettings, 'focus', 'session-1');

    // Two transitions arriving together: the last write must be the one that is stored, whole.
    await Promise.all([writeTimer(ALICE, start(base, T0)), writeTimer(ALICE, pause(start(base, T0), at(120)))]);

    const stored = await readTimer(ALICE);
    expect(stored).not.toBeNull();
    expect(['running', 'paused']).toContain(stored!.status);
    expect(stored!.sessionId).toBe('session-1');
  });
});

describe('settings', () => {
  it('are per account and fall back to the defaults', async () => {
    expect(await readSettings(ALICE)).toEqual(defaultFocusSettings);

    await writeSettings(ALICE, { ...defaultFocusSettings, focusSeconds: 50 * 60 });

    expect((await readSettings(ALICE)).focusSeconds).toBe(3000);
    expect((await readSettings(BOB)).focusSeconds).toBe(1500);
  });

  it('are clamped on the way in, so an impossible stored value cannot come back out', async () => {
    await writeSettings(ALICE, { ...defaultFocusSettings, focusSeconds: 10 });

    expect((await readSettings(ALICE)).focusSeconds).toBe(60);
  });
});

describe('the outbox', () => {
  async function record(sessionId: string, seconds = 540) {
    const stopped = finishEarly(start(readyState(defaultFocusSettings, 'focus', sessionId), T0), at(seconds));
    await enqueueRecord(ALICE, terminalRecord(stopped)!, new Date(at(seconds)).toISOString());
  }

  it('holds a finished run before anything is sent', async () => {
    await record('session-1');

    const pending = await readOutbox(ALICE);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ clientSessionId: 'session-1', outcome: 'stopped', attempts: 0 });
    expect(pending[0]!.intervals).toHaveLength(1);
  });

  it('keeps one entry per run however often it is queued', async () => {
    await record('session-1');
    await record('session-1');

    expect(await readOutbox(ALICE)).toHaveLength(1);
  });

  it('retires only the record the server acknowledged', async () => {
    await record('session-1');
    await record('session-2');

    await acknowledgeRecord(ALICE, 'session-1');

    const pending = await readOutbox(ALICE);
    expect(pending.map((entry) => entry.clientSessionId)).toEqual(['session-2']);
  });

  it('keeps a record that failed to upload, and counts the attempt', async () => {
    await record('session-1');

    await noteAttempt(ALICE, 'session-1');
    await noteAttempt(ALICE, 'session-1');

    const pending = await readOutbox(ALICE);
    // A connection that is down is a reason to retry, never a reason to drop time somebody spent.
    expect(pending).toHaveLength(1);
    expect(pending[0]!.attempts).toBe(2);
  });

  it('never hands one account the other account’s pending records', async () => {
    await record('session-1');

    expect(await readOutbox(BOB)).toEqual([]);
    expect(await readOutbox(undefined)).toEqual([]);
  });

  it('ignores a stored entry that could not be uploaded anyway', async () => {
    await secureStorage.setItem('libra.focus.outbox', JSON.stringify({ [ALICE]: [{ clientSessionId: 'x' }, null, { clientSessionId: 'y', configuredSeconds: 1500, intervals: [] }] }));

    expect(await readOutbox(ALICE)).toEqual([]);
  });
});
