/**
 * How scripts/serve.ts runs byway (C8): the mode and the engine watch. Which environment the build gets (SEC-3) is the
 * gateway's withoutSecrets, tested with it in packages/gateway/test/env.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchEngine } from '../src/server/engine-watch.ts';
import { parseServeArgs } from '../src/server/serving.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('serving byway', () => {
  it('reads the mode and the demo switch', () => {
    expect(parseServeArgs([], {})).toEqual({ mode: 'start', demo: false });
    expect(parseServeArgs(['start', '--demo'], {})).toEqual({ mode: 'start', demo: true });
    expect(parseServeArgs(['dev'], { BYWAY_DEMO: '1' })).toEqual({ mode: 'dev', demo: true });
  });
});

describe('watching the run engine (OPS-2)', () => {
  it('reports the engine down after consecutive failed checks, and not after one', async () => {
    vi.useFakeTimers();
    const answers = [true, false, true, false, false, false];
    const onDown = vi.fn();
    const ping = vi.fn(async () => {
      if (!answers.shift()) throw new Error('ECONNREFUSED');
    });
    watchEngine({ ping, intervalMs: 1000, failures: 3, onDown });
    for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000);
    expect(onDown).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onDown).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(5000);
    expect(ping).toHaveBeenCalledTimes(6);
  });

  it('stops checking when byway stops', async () => {
    vi.useFakeTimers();
    const ping = vi.fn(async () => undefined);
    const watch = watchEngine({ ping, intervalMs: 1000, onDown: () => undefined });
    await vi.advanceTimersByTimeAsync(1000);
    watch.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
