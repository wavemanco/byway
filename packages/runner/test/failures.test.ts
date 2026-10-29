/**
 * What an activity's failure hands Temporal, which keeps it in the engine's history (temporal.sqlite): never a key
 * (ADR-0074). An adapter's error may carry one in its cause or its stack, which the gateway's redaction of its message
 * does not reach (B-026), so toFailure hands on only its name and its message.
 */
import { ApplicationFailure, CancelledFailure, DefaultFailureConverter, defaultPayloadConverter } from '@temporalio/common';
import { describe, expect, it } from 'vitest';
import { toFailure } from '../src/activities/failures.ts';

/** Shaped like a fal key; not a real one. */
const FAKE_KEY = '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff';

const history = (err: unknown): string => JSON.stringify(new DefaultFailureConverter().errorToFailure(toFailure(err), defaultPayloadConverter));

describe('an error that is not byway’s own, on its way to the engine’s history', () => {
  it('keeps its name and its (redacted) message, and drops a cause and a stack that hold a key', () => {
    const err = new TypeError(`fetch failed (Key ${FAKE_KEY})`, { cause: new Error(`connect ECONNRESET Key ${FAKE_KEY}`) });
    // Read before the gateway redacted the message, the stack keeps the original words.
    expect(err.stack).toContain(FAKE_KEY);
    Object.defineProperty(err, 'message', { value: 'fetch failed (Key [redacted])', writable: true, configurable: true, enumerable: false });
    const failure = toFailure(err) as ApplicationFailure;
    expect(failure).toBeInstanceOf(ApplicationFailure);
    expect(failure).toMatchObject({ type: 'TypeError', message: 'fetch failed (Key [redacted])', nonRetryable: false });
    expect(failure.cause).toBeUndefined();
    const stored = history(err);
    expect(stored).toContain('fetch failed (Key [redacted])');
    expect(stored).not.toContain(FAKE_KEY);
    expect(stored).not.toContain('ECONNRESET');
  });

  it('a Temporal failure (the attempt’s cancel) and a value that is not an error are handed on as they are', () => {
    const cancelled = new CancelledFailure('cancelled');
    expect(toFailure(cancelled)).toBe(cancelled);
    expect(toFailure('plain')).toBe('plain');
  });
});
