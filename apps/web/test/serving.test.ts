/** How scripts/serve.ts runs byway (C8): which environment the build gets, the mode, the engine watch. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchEngine } from '../src/server/engine-watch.ts';
import { parseServeArgs, withoutSecrets } from '../src/server/serving.ts';

afterEach(() => {
  vi.useRealTimers();
});

describe('serving byway', () => {
  it('gives next build no provider key or other secret, so none can be cached under the repo (SEC-3)', () => {
    const env = {
      PATH: '/bin',
      ANTHROPIC_API_KEY: 'sk-ant-SENTINEL',
      FAL_KEY: 'fal-SENTINEL',
      GITHUB_TOKEN: 'ghp-SENTINEL',
      MY_SECRET: 'x',
      BYWAY_DATA_DIR: '/data',
      UNSET: undefined,
    };
    expect(withoutSecrets(env, ['ANTHROPIC_API_KEY', 'FAL_KEY'])).toEqual({ PATH: '/bin', BYWAY_DATA_DIR: '/data' });
  });

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
