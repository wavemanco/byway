/**
 * Temporal's dev server is started once more when it missed the 5 s Temporal's core gives it (backlog row B-117; the
 * owner's "Retry once, tests and byway's start, on the follow-up branch (Recommended)", 2026-10-23 10:10), in byway's
 * engine start (startDevEngine) and in the runner tests' harness (createHarness), both through startOnceMore. The core's
 * words are those of @temporalio/core-bridge 1.24.0 as the bridge throws them ("{e:#}"): a server that answered too late
 * and one that could not bind its port, which never answers, both end in them.
 */
import { createServer, type AddressInfo } from 'node:net';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { describe, expect, it } from 'vitest';
import { cachedTemporalExecutable, startedTooSlowly, startOnceMore } from '../src/dev-engine.ts';

const TOO_SLOW = new Error("Failed to start ephemeral server: ephemeral server at 127.0.0.1:61234 did not start within 5s. Make sure another download isn't stuck and delete the temp file.: connection refused");

/** A start that fails as `failures` say, one per try, then gives `env`; the tries and the checks between them, in order. */
function starts(failures: Error[]) {
  const seen: string[] = [];
  return {
    seen,
    start: async () => {
      seen.push('start');
      const failure = failures.shift();
      if (failure) throw failure;
      return 'env';
    },
    beforeRetry: async () => {
      seen.push('the first is gone');
    },
  };
}

describe('starting Temporal’s dev server once more', () => {
  it('reads the core’s 5 s miss, and nothing else, as starting too slowly', () => {
    expect(startedTooSlowly(TOO_SLOW)).toBe(true);
    expect(startedTooSlowly(new Error('Failed to start ephemeral server: ephemeral server executable does not exist: C:\\temp\\temporal.exe'))).toBe(false);
    expect(startedTooSlowly('did not start within 5s')).toBe(false);
  });

  // The installed SDK's own words, not a copy of them, for the bind failure of 2026-10-23 ("Only one usage of each socket
  // address"): the port is held by a listener that hangs up on every connection, so the real CLI cannot bind it and the
  // core's checks are refused at once until its 5 s are up.
  it('a dev server that cannot bind its port ends in the core’s miss, which is read as starting too slowly', async () => {
    const held = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) => held.listen({ port: 0, host: '127.0.0.1', exclusive: true }, resolve));
    try {
      const port = (held.address() as AddressInfo).port;
      const executable = cachedTemporalExecutable();
      const e = await TestWorkflowEnvironment.createLocal({ server: { port, ip: '127.0.0.1', ...(executable ? { executable } : {}) } }).catch((err: unknown) => err);
      expect(startedTooSlowly(e), String(e)).toBe(true);
    } finally {
      await new Promise((resolve) => held.close(resolve));
    }
  });

  it('a start that missed the 5 s is tried once more, after the first server is made sure gone', async () => {
    const s = starts([TOO_SLOW]);
    await expect(startOnceMore(s.start, s.beforeRetry)).resolves.toBe('env');
    expect(s.seen).toEqual(['start', 'the first is gone', 'start']);
  });

  it('a second miss is thrown as the core said it, with no third try', async () => {
    const s = starts([TOO_SLOW, TOO_SLOW]);
    await expect(startOnceMore(s.start, s.beforeRetry)).rejects.toBe(TOO_SLOW);
    expect(s.seen).toEqual(['start', 'the first is gone', 'start']);
  });

  it('any other failure is thrown at once, never tried again', async () => {
    const missing = new Error('Failed to start ephemeral server: ephemeral server executable does not exist: C:\\temp\\temporal.exe');
    const s = starts([missing]);
    await expect(startOnceMore(s.start, s.beforeRetry)).rejects.toBe(missing);
    expect(s.seen).toEqual(['start']);
  });

  it('when the first server is not gone (byway’s port is still taken), nothing is started again and that is said', async () => {
    const taken = new Error('Port 7233 on 127.0.0.1 is already in use');
    const s = starts([TOO_SLOW]);
    await expect(
      startOnceMore(s.start, async () => {
        throw taken;
      }),
    ).rejects.toBe(taken);
    expect(s.seen).toEqual(['start']);
  });
});
