/**
 * The timer that repeats the engine's lost-run pass while it runs (dev-engine.ts, repeatEvery; the pass itself is
 * tested in reconcile-while-running.test.ts). Fake timers only: no Temporal and no wall clock.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repeatEvery } from '../src/dev-engine.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('repeating a pass while the engine runs', () => {
  it('runs it every interval, the next timed from the end of the last, so two never overlap', async () => {
    vi.useFakeTimers();
    let runs = 0;
    let underWay = 0;
    let most = 0;
    // Each pass takes 2.5 s, longer than the interval.
    const pass = async () => {
      runs++;
      most = Math.max(most, ++underWay);
      await new Promise((r) => setTimeout(r, 2500));
      underWay--;
    };
    const repeating = repeatEvery(1000, pass, () => undefined);
    await vi.advanceTimersByTimeAsync(999);
    expect(runs).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toBe(1);
    // The first ends at 3.5 s; the next starts a full interval later, at 4.5 s.
    await vi.advanceTimersByTimeAsync(3499);
    expect(runs).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs).toBe(2);
    // At 8 s and at 11.5 s; the fourth is under way, and the stop waits for it to end.
    await vi.advanceTimersByTimeAsync(7000);
    expect(runs).toBe(4);
    const stopping = repeating.stop();
    await vi.advanceTimersByTimeAsync(2500);
    await stopping;
    expect(most).toBe(1);
  });

  it('reports a pass that fails, whether it throws or rejects, and runs the next as usual; a report that throws stops nothing', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const pass = vi.fn((): Promise<void> => {
      calls++;
      if (calls === 1) throw new Error('connection refused');
      if (calls === 2) return Promise.reject(new Error('deadline exceeded'));
      return Promise.resolve();
    });
    const reported: string[] = [];
    // A report that throws would leave an unhandled rejection, which fails this file.
    const repeating = repeatEvery(1000, pass, (e) => {
      reported.push((e as Error).message);
      throw new Error('the report failed too');
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(reported).toEqual(['connection refused']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reported).toEqual(['connection refused', 'deadline exceeded']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pass).toHaveBeenCalledTimes(3);
    expect(reported).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pass).toHaveBeenCalledTimes(4);
    await repeating.stop();
  });

  it('stop() lets a pass under way finish and waits for it, and no pass runs after it', async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const pass = vi.fn(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    const repeating = repeatEvery(1000, pass, () => undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(pass).toHaveBeenCalledTimes(1);
    let stopped = false;
    const stopping = repeating.stop().then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(stopped).toBe(false);
    finish?.();
    await stopping;
    expect(stopped).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pass).toHaveBeenCalledTimes(1);
  });

  it('stopped before its first pass, it never runs one', async () => {
    vi.useFakeTimers();
    const pass = vi.fn(async () => undefined);
    const repeating = repeatEvery(1000, pass, () => undefined);
    await vi.advanceTimersByTimeAsync(500);
    await repeating.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(pass).not.toHaveBeenCalled();
  });
});
