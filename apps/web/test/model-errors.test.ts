/**
 * What the person is told when a call made while recommending or composing fails, for failures that are byway's own
 * rather than the provider's (follow-up (e) to F03). They used to share 'provider-error' with the provider's own
 * failures, so every one read "The model provider did not answer. Try again in a minute.": untrue when the provider did
 * answer, and for a call the provider had billed, "try again" invited paying a second time.
 */
import { describe, expect, it } from 'vitest';
import { GatewayError } from '@byway/contracts';
import { waitedError } from '@byway/gateway';
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

  it('a model that declined, and declined again when byway asked once more: the gateway’s one plain message (ADR-0102)', () => {
    const message =
      'Anthropic’s model claude-opus-5-5 declined this request (reason given: cyber). byway asked it once more, and it declined again. Both attempts were billed: $0.0080 in all. Rephrase the request, or choose another model profile in Settings, then try again.';
    const err = new GatewayError('refused', message, false, {
      declined: { provider: 'anthropic', model: 'claude-opus-5-5', purpose: 'advisor.intake', kind: 'completion', reason: 'cyber', ledgerEntryId: 'e1', costUsd: 0.004, retry: 'declined', retryLedgerEntryId: 'e2', retryCostUsd: 0.004 },
    });
    expect(modelProblem(err)).toEqual({ status: 502, message });
    // A retry that failed after it was billed keeps the decline's message too, not the generic billed one.
    const billedRetry = new GatewayError('refused', 'Anthropic’s model … declined this request … but that attempt failed: …', false, { billed: true, declined: { ...err.declined!, retry: 'failed' } });
    expect(modelProblem(billedRetry)).toEqual({ status: 502, message: billedRetry.message });
    // A refusal that is not a decline under the rule keeps the general words.
    expect(modelProblem(new GatewayError('refused', 'anthropic declined (bio)'))).toEqual({ status: 502, message: 'The model declined to answer this request. Rephrase the problem, or choose a recipe from the Library.' });
  });

  it('a call that used the whole of its model’s wait: the gateway’s words (the wait ran out, it may have billed, where to change it), and that trying again makes a new call (CRITIC-1)', () => {
    const gemini = { provider: 'google' as const, model: 'gemini-3.1-pro-preview' };
    const opus = { provider: 'anthropic' as const, model: 'claude-opus-5-5' };
    const cases = [
      // A Google text call answered whole, not sent again (the owner's "Give up and end the call plainly").
      waitedError(gemini, { minutes: 15, how: 'answer' }, { retryable: false, billing: 'maybe' }),
      // A stream that sent nothing for its wait, sent once more, and silent again.
      waitedError(opus, { minutes: 60, how: 'silence' }, { retryable: true, billing: 'maybe' }),
    ];
    for (const err of cases) {
      expect(modelProblem(err)).toEqual({ status: 504, message: `${err.message} Trying again makes a new call, which may be billed too.` });
    }
    expect(modelProblem(cases[0])?.message).toBe(
      "Google’s model gemini-3.1-pro-preview did not answer within 15 minutes, the wait chosen in Settings, so byway stopped waiting. It may have billed the work. To wait longer, change 'How long to wait for an answer' in Settings. Trying again makes a new call, which may be billed too.",
    );
    expect(modelProblem(cases[1])?.message).toMatch(/^Anthropic’s model claude-opus-5-5 sent nothing for 60 minutes, the wait chosen in Settings, .*'How long to wait for an answer' in Settings\./);
    // Read by its mark, as every error here is: one made by another server bundle says the same.
    const foreign = Object.assign(new Error(cases[0]!.message), { name: 'GatewayError', code: 'provider-error', retryable: false, waited: { minutes: 15, how: 'answer' } });
    expect(modelProblem(foreign)).toEqual(modelProblem(cases[0]));
    // A mark that is not a wait is not read as one.
    expect(modelProblem(Object.assign(new GatewayError('provider-error', 'HTTP 503', true), { waited: 'yes' }))?.message).toBe('The model provider did not answer. Try again in a minute.');
  });

  it('keeps the provider’s own failure as it was', () => {
    expect(modelProblem(new GatewayError('provider-error', 'HTTP 503', true))).toEqual({ status: 503, message: 'The model provider did not answer. Try again in a minute.' });
  });

  it('reads an error made by another server bundle by its name, code and billed flag, not its class', () => {
    const foreign = Object.assign(new Error('x answered and billed this call'), { name: 'GatewayError', code: 'byway-failure', billed: true });
    expect(modelProblem(foreign)?.status).toBe(500);
  });
});
