/**
 * A call that used the whole of its model's wait, chosen in Settings' "How long to wait for an answer" (the waits design
 * of 2026-10-22, section 7): what the step's failure says, and how the spend book records it (the reason 'waited', with
 * how long and how it waited: WaitedFor). Settings' Spending records say the same (apps/web's waitedText).
 * - In silence: a streamed answer (Anthropic, OpenAI, OpenRouter) sent nothing for its model's wait. It is sent once
 *   more first, as for any lost answer (ADR-0091), and fails with these words if the second goes silent too.
 * - For a whole answer: a call answered whole (a Google text call, an OpenAI or Google image) did not answer within its
 *   model's wait. It is not sent again: "Give up and end the call plainly (Recommended)", the owner's choice of
 *   2026-10-22 ("It stops at your wait, and the step says the wait ran out and where to change it in Settings; other
 *   connection failures are still sent once more.").
 * - For a clip: a fal clip was not finished within its model's wait from fal's acceptance, and byway cancelled it. A
 *   queue job is never sent again (ADR-0091); what fal answered to the cancel decides what is counted (providers/fal.ts).
 */
import { GatewayError, type ModelRef, type ProviderId, type WaitedFor } from '@byway/contracts';
import type { Billing, ClassifiedError } from './errors.ts';

const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter', fal: 'fal.ai', mock: 'The demo' };

/** What every wait that ran out ends with: the money, and where to wait longer. */
const MAYBE_BILLED = "It may have billed the work. To wait longer, change 'How long to wait for an answer' in Settings.";
const WAIT_LONGER = "To wait longer, change 'How long to wait for an answer' in Settings.";

/**
 * The words for a call that used the whole of its wait: "{Model} sent nothing for {N} minutes, the wait chosen in
 * Settings, so byway stopped waiting. It may have billed the work. To wait longer, change 'How long to wait for an
 * answer' in Settings." (the design's words for a stall), "did not answer within {N} minutes" for a whole answer, and
 * "did not finish clip job {id} within {N} minutes", with what fal answered to byway's cancel, for a clip. A clip fal
 * removed from its queue before it ran (`billing` 'none') says nothing was billed instead.
 */
export function waitedWords(ref: Pick<ModelRef, 'provider' | 'model'>, waited: WaitedFor, opts: { job?: string; billing?: Billing } = {}): string {
  const model = `${PROVIDER_NAMES[ref.provider] ?? ref.provider}’s model ${ref.model}`;
  const tail = opts.billing === 'none' ? WAIT_LONGER : MAYBE_BILLED;
  const n = waited.minutes;
  if (waited.how === 'silence') return `${model} sent nothing for ${n} minutes, the wait chosen in Settings, so byway stopped waiting. ${tail}`;
  if (waited.how === 'answer') return `${model} did not answer within ${n} minutes, the wait chosen in Settings, so byway stopped waiting. ${tail}`;
  const job = opts.job !== undefined ? `clip job ${opts.job}` : 'its clip';
  const cancel = waited.cancel !== undefined ? `: ${waited.cancel}` : '';
  return `${model} did not finish ${job} within ${n} minutes, the wait chosen in Settings, so byway stopped waiting and cancelled it${cancel}. ${tail}`;
}

/** A failure because a call used the whole of its wait: `waited` says how, for the spend book's record (PaidCall). */
export type WaitedError = ClassifiedError & { waited: WaitedFor };

/**
 * The failure of a call that used the whole of its wait (waitedWords), as a 'provider-error': the provider did not
 * answer in time. `retryable` is true only for a stream's silence, which is sent once more; `billing` is 'maybe' unless
 * fal removed the clip before it ran.
 */
export function waitedError(ref: Pick<ModelRef, 'provider' | 'model'>, waited: WaitedFor, opts: { retryable: boolean; billing: Billing; job?: string }): WaitedError {
  const err = new GatewayError('provider-error', waitedWords(ref, waited, opts), opts.retryable, opts.billing === 'none' ? { billed: false } : {}) as WaitedError;
  err.billing = opts.billing;
  err.waited = waited;
  return err;
}

/** How a failure used the whole of its wait, when it did (waitedError), by its mark, so it survives being passed along. */
export function waitedOf(e: unknown): WaitedFor | undefined {
  if (!(e instanceof GatewayError)) return undefined;
  const w = (e as Partial<WaitedError>).waited;
  return typeof w === 'object' && w !== null && typeof w.minutes === 'number' ? w : undefined;
}

/** A wait in minutes, as the words and the record give it. */
export const waitMinutes = (ms: number): number => ms / 60_000;
