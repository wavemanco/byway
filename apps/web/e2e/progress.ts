/**
 * How long the browser tests wait on a run (C5-FLAKE). The owner chose "Fix it in Block 2 (Recommended)": "The e2e
 * helper waits on the run's progress (a new event within 120 s) instead of on the next turn alone, so a slow but moving
 * run no longer fails; tested by mutation, and part of Block 2's check." Before, a wait failed when no turn and no end
 * came within 120 s of the last answer, however busy the run was: on CI's 2-CPU Windows machine C5 was still making its
 * shots, 7 to 28 s apart, when its 120 s ran out (backlog row "Known Windows timing flake: browser test C5 waits at most
 * 120 s for each next turn").
 *
 * Now a wait has a window instead of a deadline. It looks for its outcome (a turn, the run's end or its failure) as
 * before, and every few seconds it also reads the run's events through the app's own API, the one the Run screen polls;
 * each event it has not seen before, by sequence number, restarts the window. It fails only when a whole window passes
 * with no new event, no turn and no end, and its message names the run's last event. A run that keeps moving is waited
 * on for as long as the test itself may run (Playwright's limit per test), which still bounds it.
 *
 * Which signal counts as progress is Claude's choice (the build map left it open): the API's event sequence, which is
 * exact and names the event, rather than the timeline, which shows what a person sees but can change with no event or
 * stay the same through one. The window logic is here, apart from Playwright, with the clock and the reads passed in,
 * so a unit test drives it on a clock of its own (test/e2e-progress.test.ts).
 */
import type { RunEvent } from '@byway/contracts';

/** How often a wait looks at the page for its outcome. */
export const LOOK_EVERY_MS = 250;

/**
 * How often a wait reads the run's events. The Run screen itself reads them every second while the AI works; one more
 * small read every few seconds adds little to a slow machine, and a window restarts at most this late after an event.
 */
export const READ_EVERY_MS = 5000;

/**
 * Progress: the newest event of a reply, when it is newer than `seen` (a higher sequence number); before anything was
 * seen, any event is new. A read that got no answer (`undefined`), an empty reply, the seen event read again and an
 * older reply are not progress.
 */
export function progress(seen: RunEvent | undefined, events: readonly RunEvent[] | undefined): RunEvent | undefined {
  if (!events) return undefined;
  let newest = seen;
  for (const e of events) if (newest === undefined || e.seq > newest.seq) newest = e;
  return newest === seen ? undefined : newest;
}

/** A wait's window: how long it is, when it last started (the wait's start, or the last progress), and the last event seen. */
export interface ProgressWindow {
  readonly windowMs: number;
  readonly since: number;
  readonly last: RunEvent | undefined;
}

export function openWindow(windowMs: number, now: number, last?: RunEvent): ProgressWindow {
  return { windowMs, since: now, last };
}

/** The window after a read at `now`: restarted from `now` on progress, and the same window otherwise. */
export function observe(w: ProgressWindow, now: number, events: readonly RunEvent[] | undefined): ProgressWindow {
  const newer = progress(w.last, events);
  return newer ? { ...w, since: now, last: newer } : w;
}

/** Whether a whole window has passed with no progress. */
export function stalled(w: ProgressWindow, now: number): boolean {
  return now - w.since >= w.windowMs;
}

/** An event as the failure names it: its number and type, its step and the step's label when it has them, and when it happened. */
export function describeEvent(e: RunEvent): string {
  const label = typeof e.data.label === 'string' ? ` ("${e.data.label}")` : '';
  const step = e.stepId ? ` of ${e.stepId}${label}` : label;
  return `#${e.seq}, ${e.type}${step}, at ${e.at}`;
}

/** The time a wait keeps: the real one in the browser tests, a test's own in the unit test. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export interface ProgressWait<T> {
  /** How long the run may show no progress: no new event, no turn and no end. */
  windowMs: number;
  clock: Clock;
  /** One look at the page, without waiting: the outcome if there is one now, `undefined` while there is none. */
  look(): Promise<T | undefined>;
  /**
   * The run's events after sequence number `afterSeq`, or `undefined` when the app did not answer. Absent on a page that
   * shows no run: then only an outcome counts, in one window from the start, as every wait did before.
   */
  read?: (afterSeq: number) => Promise<readonly RunEvent[] | undefined>;
  /** The last event an earlier wait on the same run saw, so this one reads only what is newer and can name it. */
  seen?: RunEvent | undefined;
  /** What the wait follows, for its failure: "answering <checkpoint>", or "starting". */
  after: string;
}

/**
 * Looks for the outcome until there is one, reading the run's events every READ_EVERY_MS; each new event restarts the
 * window. Returns the outcome and the last event seen (for the next wait on the run), or throws once a whole window
 * passes with no progress.
 */
export async function waitOnProgress<T>(wait: ProgressWait<T>): Promise<{ outcome: T; last: RunEvent | undefined }> {
  const { clock } = wait;
  const started = clock.now();
  let win = openWindow(wait.windowMs, started, wait.seen);
  let nextRead = started;
  let reads = 0;
  let unanswered = 0;
  for (;;) {
    const outcome = await wait.look();
    if (outcome !== undefined) return { outcome, last: win.last };
    if (wait.read && clock.now() >= nextRead) {
      const events = await wait.read(win.last?.seq ?? 0);
      reads++;
      if (!events) unanswered++;
      // The event was seen when the reply came, so the window restarts then.
      win = observe(win, clock.now(), events);
      nextRead = clock.now() + READ_EVERY_MS;
    }
    if (stalled(win, clock.now())) throw new Error(stalledMessage(wait, win, clock.now() - started, reads, unanswered));
    await clock.sleep(LOOK_EVERY_MS);
  }
}

/** The failure, in plain words: what did not come, the run's last event, how long the wait was in all. */
function stalledMessage(wait: ProgressWait<unknown>, win: ProgressWindow, waitedMs: number, reads: number, unanswered: number): string {
  const head = `Nothing happened in ${win.windowMs / 1000} s after ${wait.after}`;
  if (!wait.read) return `${head}: no turn and no end (this page shows no run, so no event was read).`;
  const last = win.last ? `Its last event: ${describeEvent(win.last)}.` : 'No event of the run was read.';
  const lost = unanswered > 0 ? ` ${unanswered} of its ${reads} reads of the run's events got no answer.` : '';
  return `${head}: no turn, no end and no new event of the run. ${last}${lost} Waited ${Math.round(waitedMs / 1000)} s in all.`;
}
