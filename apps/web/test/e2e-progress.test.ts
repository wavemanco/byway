/**
 * How long the browser tests wait on a run (e2e/progress.ts; C5-FLAKE, the owner's choice "Fix it in Block 2
 * (Recommended)"): a wait restarts its window each time the run shows a new event, so a slow but moving run is waited
 * on to its next turn or its end, and fails only when a whole window passes with no new event, no turn and no end,
 * naming the run's last event. Driven on a clock the test owns (sleeping moves it on at once) and a run scripted on it,
 * so every time below is exact and nothing waits.
 */
import { describe, expect, it } from 'vitest';
import type { RunEvent } from '@byway/contracts';
import { LOOK_EVERY_MS, READ_EVERY_MS, observe, openWindow, progress, stalled, waitOnProgress, type Clock } from '../e2e/progress.ts';

const WINDOW_MS = 120_000;
const BASE = Date.UTC(2026, 9, 22, 9, 0, 0);

/** Where the test's clock stops: a wait still going an hour in would never have ended, and fails rather than spins. */
const CLOCK_ENDS_MS = 3_600_000;

/** A clock the test owns: sleeping moves it on at once, by exactly what was asked, up to CLOCK_ENDS_MS. */
function fakeClock(): Clock & { at(): number } {
  let t = 0;
  return {
    now: () => t,
    at: () => t,
    sleep: async (ms) => {
      t += ms;
      if (t > CLOCK_ENDS_MS) throw new Error('The wait never ended.');
    },
  };
}

/** The run's event number `seq`, `atMs` after the clock's start: a step starting, as the timeline shows it. */
function event(seq: number, atMs: number): RunEvent {
  return { runId: 'run-1', seq, at: new Date(BASE + atMs).toISOString(), type: 'step-started', stepId: `step-${seq}`, data: { label: `Shot ${seq}` } };
}

/**
 * A run on `clock`: its events come at `times` (ms from the start), and it is done from `doneAt` on. `read` answers as
 * the app's API does, with the events after the sequence number asked for that have happened by now; `asked` keeps
 * each sequence number it was asked for.
 */
function scriptedRun(clock: Clock, times: readonly number[], doneAt = Number.POSITIVE_INFINITY) {
  const events = times.map((t, i) => event(i + 1, t));
  const asked: number[] = [];
  return {
    look: async () => (clock.now() >= doneAt ? ('done' as const) : undefined),
    read: async (afterSeq: number) => {
      asked.push(afterSeq);
      return events.filter((e) => e.seq > afterSeq && Date.parse(e.at) - BASE <= clock.now());
    },
    asked,
  };
}

describe('what counts as progress', () => {
  it('is an event newer than the last one seen, the newest of the reply; a failed, empty, repeated or older reply is not', () => {
    expect(progress(event(4, 0), undefined)).toBeUndefined();
    expect(progress(event(4, 0), [])).toBeUndefined();
    expect(progress(event(4, 0), [event(4, 0)])).toBeUndefined();
    expect(progress(event(4, 0), [event(2, 0), event(3, 0)])).toBeUndefined();
    expect(progress(event(4, 0), [event(5, 0), event(7, 0), event(6, 0)])?.seq).toBe(7);
    // Before anything was seen, any event is new.
    expect(progress(undefined, [event(1, 0), event(2, 0)])?.seq).toBe(2);
  });

  it('restarts the window when the run shows progress, and only then', () => {
    const opened = openWindow(WINDOW_MS, 0, event(1, 0));
    expect(stalled(opened, WINDOW_MS - 1)).toBe(false);
    expect(stalled(opened, WINDOW_MS)).toBe(true);
    const moved = observe(opened, 100_000, [event(2, 100_000)]);
    expect(moved.since).toBe(100_000);
    expect(moved.last?.seq).toBe(2);
    expect(stalled(moved, 100_000 + WINDOW_MS - 1)).toBe(false);
    // Nothing new: the same window, the same last event.
    expect(observe(moved, 150_000, [])).toBe(moved);
    expect(observe(moved, 150_000, undefined)).toBe(moved);
  });
});

describe('the wait on a run', () => {
  it('waits on a slow but moving run (an event every 100 s for 400 s) to its end', async () => {
    const clock = fakeClock();
    const run = scriptedRun(clock, [0, 100_000, 200_000, 300_000, 400_000], 410_000);
    const { outcome, last } = await waitOnProgress({ windowMs: WINDOW_MS, clock, look: run.look, read: run.read, after: 'answering cp7-voice' });
    expect(outcome).toBe('done');
    expect(last?.seq).toBe(5);
    expect(clock.at()).toBe(410_000);
  });

  it('fails a stalled run 120 s after its last event, saying so and naming that event', async () => {
    const clock = fakeClock();
    const run = scriptedRun(clock, [0, 50_000]);
    const failed = waitOnProgress({ windowMs: WINDOW_MS, clock, look: run.look, read: run.read, after: 'answering cp7-voice' });
    await expect(failed).rejects.toThrow(/^Nothing happened in 120 s after answering cp7-voice: no turn, no end and no new event of the run\./);
    await expect(failed).rejects.toThrow(/Its last event: #2, step-started of step-2 \("Shot 2"\), at 2026-10-22T09:00:50\.000Z\./);
    await expect(failed).rejects.toThrow(/Waited 170 s in all\.$/);
    // Not before 120 s have passed since the event at 50 s, and within one read of it.
    expect(clock.at()).toBeGreaterThanOrEqual(50_000 + WINDOW_MS);
    expect(clock.at()).toBeLessThan(50_000 + WINDOW_MS + READ_EVERY_MS);
  });

  it('reads only the events after the last one a wait before it saw, and that event read again is not progress', async () => {
    const clock = fakeClock();
    const seen = event(3, 0);
    const asked: number[] = [];
    const failed = waitOnProgress({
      windowMs: WINDOW_MS,
      clock,
      look: async () => undefined,
      // A reply that holds the seen event again (a stale answer), as a new object, as a reply read from JSON is: no new event.
      read: async (afterSeq) => {
        asked.push(afterSeq);
        return [{ ...seen }];
      },
      seen,
      after: 'answering cp-3',
    });
    await expect(failed).rejects.toThrow(/Its last event: #3, step-started/);
    expect(clock.at()).toBeGreaterThanOrEqual(WINDOW_MS);
    expect(clock.at()).toBeLessThan(WINDOW_MS + READ_EVERY_MS);
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set([3]));
  });

  it('counts a read the app did not answer as no progress, and says how many went unanswered', async () => {
    const clock = fakeClock();
    let reads = 0;
    const failed = waitOnProgress({
      windowMs: WINDOW_MS,
      clock,
      look: async () => undefined,
      read: async () => {
        reads++;
        return undefined;
      },
      seen: event(7, 0),
      after: 'answering cp-7',
    });
    await expect(failed).rejects.toThrow(/Its last event: #7, step-started of step-7 \("Shot 7"\)/);
    await expect(failed).rejects.toThrow(new RegExp(`${reads} of its ${reads} reads of the run's events got no answer`));
    expect(clock.at()).toBeGreaterThanOrEqual(WINDOW_MS);
    expect(clock.at()).toBeLessThan(WINDOW_MS + LOOK_EVERY_MS);
  });

  it('on a page that shows no run, counts only a turn or the end, in one window from the start', async () => {
    const clock = fakeClock();
    const failed = waitOnProgress({ windowMs: 20_000, clock, look: async () => undefined, after: 'answering cp-1' });
    await expect(failed).rejects.toThrow(/^Nothing happened in 20 s after answering cp-1: no turn and no end \(this page shows no run, so no event was read\)\./);
    expect(clock.at()).toBeGreaterThanOrEqual(20_000);
    expect(clock.at()).toBeLessThan(20_000 + LOOK_EVERY_MS);
  });

  it('returns what it found at once: a turn that is open already is not waited past', async () => {
    const clock = fakeClock();
    const run = scriptedRun(clock, [0]);
    const { outcome } = await waitOnProgress({ windowMs: WINDOW_MS, clock, look: async () => 'turn' as const, read: run.read, after: 'starting' });
    expect(outcome).toBe('turn');
    expect(clock.at()).toBe(0);
  });
});
