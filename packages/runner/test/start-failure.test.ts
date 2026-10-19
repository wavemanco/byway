/**
 * OPS-2 (runner part): a run whose workflow could not be started stays in History as failed, and says why in plain
 * words. When the engine was simply not there, it says so and that nothing was spent; any other cause keeps its text.
 * B1 (ADR-0107): a start whose reply timed out (gRPC 4, DEADLINE_EXCEEDED) may have reached Temporal, so it is not read
 * as the engine being down. The client asks Temporal for the workflow first (start-describe.test.ts): when Temporal has
 * none, the run did not start; when byway could not ask, the message says it cannot tell, and does not say nothing was
 * spent.
 */
import { describe, expect, it } from 'vitest';
import { ENGINE_DOWN_AT_START, ENGINE_SLOW_AT_START, ENGINE_SLOW_UNCONFIRMED, isTimeout, isTransportFailure, startFailureMessage } from '../src/start-failure.ts';

const grpc = (code: number, message: string) => Object.assign(new Error(message), { code });

describe('a run that could not start', () => {
  it('says plainly that the engine was not running, when the start never reached it', () => {
    for (const e of [
      grpc(14, '14 UNAVAILABLE: No connection established. Last error: connect ECONNREFUSED 127.0.0.1:7233'),
      new Error('Failed to start', { cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }) }),
    ]) {
      expect(isTransportFailure(e)).toBe(true);
      expect(isTimeout(e)).toBe(false);
      expect(startFailureMessage(e, 'absent')).toBe(ENGINE_DOWN_AT_START);
      expect(startFailureMessage(e, 'unknown')).toBe(ENGINE_DOWN_AT_START);
    }
    expect(ENGINE_DOWN_AT_START).toMatch(/not running/);
    expect(ENGINE_DOWN_AT_START).toMatch(/Nothing was spent/);
  });

  it('a start that timed out is not read as the engine being down: it may have reached Temporal (B1)', () => {
    const e = grpc(4, '4 DEADLINE_EXCEEDED: Deadline exceeded');
    const wrapped = new Error('Failed to start Workflow', { cause: e });
    for (const err of [e, wrapped]) {
      expect(isTransportFailure(err)).toBe(false);
      expect(isTimeout(err)).toBe(true);
      // Temporal has no workflow for it: the run did not start, so nothing was spent.
      expect(startFailureMessage(err, 'absent')).toBe(ENGINE_SLOW_AT_START);
      // byway could not ask Temporal: the run may have started, so the message does not say nothing was spent.
      expect(startFailureMessage(err, 'unknown')).toBe(ENGINE_SLOW_UNCONFIRMED);
    }
    expect(ENGINE_SLOW_AT_START).toBe("byway's run engine did not answer in time, so this run did not start. Nothing was spent. Start it again.");
    expect(ENGINE_SLOW_UNCONFIRMED).not.toMatch(/Nothing was spent|did not start/);
    expect(ENGINE_SLOW_UNCONFIRMED).toMatch(/cannot tell whether this run started/);
    expect(ENGINE_SLOW_UNCONFIRMED).toMatch(/may still be charged/);
  });

  it('keeps any other cause, prefixed; and when byway could not ask Temporal, says it cannot tell', () => {
    const e = new Error('Namespace default is not found');
    expect(isTransportFailure(e)).toBe(false);
    expect(isTimeout(e)).toBe(false);
    expect(startFailureMessage(e, 'absent')).toBe('The run could not be started: Namespace default is not found');
    const unknown = startFailureMessage(e, 'unknown');
    expect(unknown).toMatch(/^The run's start failed \(Namespace default is not found\), so byway cannot tell whether this run started\./);
    expect(unknown).not.toMatch(/Nothing was spent|could not be started/);
  });
});
