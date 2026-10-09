/**
 * What the person is told when a call made while recommending or composing fails, for failures that are byway's own
 * rather than the provider's (follow-up (e) to F03). They used to share 'provider-error' with the provider's own
 * failures, so every one read "The model provider did not answer. Try again in a minute.": untrue when the provider did
 * answer, and for a call the provider had billed, "try again" invited paying a second time.
 */
import { describe, expect, it } from 'vitest';
import { GatewayError } from '@byway/contracts';
import { modelProblem } from '../src/server/model-errors.ts';

const billed = (code: 'byway-failure' | 'provider-error', message: string) => new GatewayError(code, message, false, { billed: true });

describe('byway’s own failures while recommending or composing (follow-up (e))', () => {
  it('a call the provider answered and billed, which byway could not keep or record: says it was paid for, that it is counted, and that trying again pays again', () => {
    for (const err of [
      billed('byway-failure', 'anthropic answered and billed this call (advisor.intake), but byway could not record its cost in its spending records: database is locked.'),
      billed('byway-failure', 'anthropic answered and billed this call (advisor.compose) and its cost is recorded (entry e1), but its request and response could not be stored: ENOSPC.'),
      // A provider failure after billing (its output could not be used) is billed too.
      billed('provider-error', 'fal made the clip and billed it, but its last frame could not be extracted'),
    ]) {
      const problem = modelProblem(err);
      expect(problem?.status).toBe(500);
      expect(problem?.message).toBe(
        'The model answered and the call was paid for, but byway could not keep the answer, so nothing changed here. The cost is counted in your spending (Settings, Spending records). Trying again makes, and pays for, a new call.',
      );
      expect(problem?.message).not.toMatch(/did not answer/);
    }
  });

  it('a call byway did not start (it is stopping, or could not record it as sent): its own words, which say nothing was sent', () => {
    for (const message of [
      'byway is stopping, so it did not start this call. Try again once it has started again.',
      'byway could not record this call as sent in its spending records, so it did not send it. Try again.',
    ]) {
      expect(modelProblem(new GatewayError('byway-failure', message, true, { billed: false }))).toEqual({ status: 503, message });
    }
  });

  it('another attempt of the same call still under way', () => {
    expect(modelProblem(new GatewayError('in-flight', 'another attempt of this call is under way', true))).toEqual({
      status: 409,
      message: 'This request is already being answered. Wait a moment, then try again.',
    });
  });

  it('keeps the provider’s own failure as it was', () => {
    expect(modelProblem(new GatewayError('provider-error', 'HTTP 503', true))).toEqual({ status: 503, message: 'The model provider did not answer. Try again in a minute.' });
  });

  it('reads an error made by another server bundle by its name, code and billed flag, not its class', () => {
    const foreign = Object.assign(new Error('x answered and billed this call'), { name: 'GatewayError', code: 'byway-failure', billed: true });
    expect(modelProblem(foreign)?.status).toBe(500);
  });
});
