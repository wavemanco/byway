/**
 * OPS-2 (runner part): a run whose workflow could not be started stays in History as failed, and says why in plain
 * words. When the engine was simply not there, it says so and that nothing was spent; any other cause keeps its text.
 */
import { describe, expect, it } from 'vitest';
import { ENGINE_DOWN_AT_START, isTransportFailure, startFailureMessage } from '../src/start-failure.ts';

const grpc = (code: number, message: string) => Object.assign(new Error(message), { code });

describe('a run that could not start', () => {
  it('says plainly that the engine was not running, when the transport failed', () => {
    for (const e of [
      grpc(14, '14 UNAVAILABLE: No connection established. Last error: connect ECONNREFUSED 127.0.0.1:7233'),
      new Error('Failed to start', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }),
      grpc(4, '4 DEADLINE_EXCEEDED: Deadline exceeded'),
    ]) {
      expect(isTransportFailure(e)).toBe(true);
      expect(startFailureMessage(e)).toBe(ENGINE_DOWN_AT_START);
    }
    expect(ENGINE_DOWN_AT_START).toMatch(/not running/);
    expect(ENGINE_DOWN_AT_START).toMatch(/Nothing was spent/);
  });

  it('keeps any other cause, prefixed', () => {
    const e = new Error('Namespace default is not found');
    expect(isTransportFailure(e)).toBe(false);
    expect(startFailureMessage(e)).toBe('The run could not be started: Namespace default is not found');
  });
});
