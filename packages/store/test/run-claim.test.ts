/**
 * A run's start claim (migration 12; backlog row B-188): Runner.start keeps a random start token with the run, and the
 * run's first step claims the run for its Temporal execution with it, once. A workflow another program starts, replays
 * or resets through Temporal's port runs in another execution, so it cannot claim the run.
 */
import { describe, expect, it } from 'vitest';
import { openStore, seedRun } from './helpers.ts';

describe("a run's start claim", () => {
  it('is granted to the first execution with the run’s start token, again to that execution, and to no other', async () => {
    const store = openStore();
    const run = await seedRun(store, 'run-1', { startToken: 'token-1' } as never);
    expect(run).not.toHaveProperty('startToken');
    expect(await store.runClaim('run-1')).toBeUndefined();
    expect(await store.claimRun('run-1', 'token-2', 'exec-a')).toBe(false);
    expect(await store.runClaim('run-1')).toBeUndefined();
    expect(await store.claimRun('run-1', 'token-1', 'exec-a')).toBe(true);
    expect(await store.claimRun('run-1', 'token-1', 'exec-a')).toBe(true);
    expect(await store.claimRun('run-1', 'token-1', 'exec-b')).toBe(false);
    expect(await store.runClaim('run-1')).toBe('exec-a');
    expect(JSON.stringify(await store.getRun('run-1'))).not.toContain('token-1');
  });

  it('cannot be granted for a run created without a start token, or for a run that does not exist', async () => {
    const store = openStore();
    await seedRun(store, 'run-1');
    expect(await store.claimRun('run-1', 'anything', 'exec-a')).toBe(false);
    expect(await store.claimRun('no-such-run', 'anything', 'exec-a')).toBe(false);
    expect(await store.runClaim('no-such-run')).toBeUndefined();
  });

});
