/**
 * One refusal rule for every provider (ADR-0102, the owner's decision D1): no provider may answer with another model than
 * the one the person chose, and a decline gets one retry on the same model, then a plain failure. This module holds the
 * words: what a decline is called in the ledger, and what the person reads about one. The gateway uses them for its
 * failure, the runner for the run's events and an image step's note, so the person reads one story wherever they look.
 */
import type { BudgetDetails, DeclineRecord, GatewayError, ProviderId } from '@byway/contracts';
import type { Redactor } from './redact.ts';

const PROVIDER_NAMES: Record<ProviderId, string> = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google', openrouter: 'OpenRouter', fal: 'fal.ai', mock: 'The demo' };

/** How long a stated reason may be in the ledger and in what the person reads (OpenAI's is the model's own sentence). */
export const MAX_REASON_CHARS = 200;

const usd = (n: number) => `$${n.toFixed(4)}`;
const roundUsd = (n: number) => Math.round(n * 1_000_000) / 1_000_000;

/**
 * A provider's stated reason as the ledger and the person get it, or undefined when there is none: text however the
 * provider sent it (adapters copy it unchecked), made well formed (a lone surrogate has no canonical form, F19), scrubbed
 * of held keys (ADR-0088), on one line, and at most MAX_REASON_CHARS characters, cut at a character, never inside one.
 */
export function cleanReason(value: unknown, redact: Redactor): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = redact((typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))).toWellFormed()).replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  const chars = Array.from(text);
  return chars.length <= MAX_REASON_CHARS ? text : `${chars.slice(0, MAX_REASON_CHARS - 1).join('')}…`;
}

/** Who declined: "Anthropic’s model claude-opus-5-5". */
const whoOf = (d: Pick<DeclineRecord, 'provider' | 'model'>): string => `${PROVIDER_NAMES[d.provider] ?? d.provider}’s model ${d.model}`;
/** What was declined, by default: "this image" or "this request". */
const whatOf = (d: Pick<DeclineRecord, 'kind'>): string => (d.kind === 'image' ? 'this image' : 'this request');

/**
 * What the attempts cost, each from its own recorded cost: an attempt byway recorded at no cost (OpenAI's moderation
 * block reports no usage) is never called billed. `retryUsd` is the retry's cost when it was settled.
 */
function costWords(declinedUsd: number, retryUsd: number | undefined): string {
  if (retryUsd === undefined) return declinedUsd > 0 ? `The declined attempt was billed: ${usd(declinedUsd)}.` : 'byway recorded no cost for the declined attempt.';
  if (declinedUsd > 0 && retryUsd > 0) return `Both attempts were billed: ${usd(roundUsd(declinedUsd + retryUsd))} in all.`;
  if (declinedUsd > 0) return `The declined attempt was billed: ${usd(declinedUsd)}; byway recorded no cost for the retry.`;
  if (retryUsd > 0) return `The retry was billed: ${usd(retryUsd)}; byway recorded no cost for the declined attempt.`;
  return 'byway recorded no cost for either attempt.';
}

/**
 * What byway counts as "may have been billed" for the attempts, beyond what they were billed, in words (ADR-0095): for an
 * attempt that was settled, the estimate retained for a send of it that may have been billed before it was sent again
 * (every paid call is sent again like this; for a decline the words name it); for a retry that ended with no answer
 * byway could record, that it may have been billed, with all byway counts for it. Empty when byway counts nothing.
 */
function maybeWords(d: DeclineRecord): string {
  const declinedUsd = d.uncertainUsd ?? 0;
  const retryUsd = d.retryUncertainUsd ?? 0;
  const retrySettled = d.retryCostUsd !== undefined;
  const resent = [...(declinedUsd > 0 ? ['declined'] : []), ...(retryUsd > 0 && retrySettled ? ['retry'] : [])];
  const resentUsd = roundUsd(declinedUsd + (retrySettled ? retryUsd : 0));
  const words: string[] = [];
  if (resent.length === 2) {
    words.push(`Both attempts were sent again after a send that may have been billed, so byway also counts ${usd(resentUsd)} for them against the workspace budget (the estimate, once for each such send) until you clear it in Settings.`);
  } else if (resent.length === 1) {
    const which = resent[0] === 'declined' ? 'The declined attempt' : 'The retry';
    words.push(`${which} was sent again after a send that may have been billed, so byway also counts ${usd(resentUsd)} for it against the workspace budget (its estimate, once for each such send) until you clear it in Settings.`);
  }
  if (retryUsd > 0 && !retrySettled) {
    words.push(
      `The retry may have been billed${d.costUsd > 0 ? ' too' : ''}, so byway counts ${usd(retryUsd)} for it against the workspace budget (its estimate, once for each time it may have reached ${PROVIDER_NAMES[d.provider] ?? d.provider}) until you clear it in Settings.`,
    );
  }
  return words.map((w) => ` ${w}`).join('');
}

/**
 * What happened, in plain words: who declined what, the reason they gave, what byway did once more, and what each attempt
 * cost: a retry that was billed but brought no usable answer is counted, and what byway counts as "may have been billed"
 * for either attempt (a send that may have been billed before it was sent again, or a retry that ended with no answer
 * byway could record) is named, until it is cleared in Settings. `what` names the thing declined ("this request", "this
 * image", "the image for shot 2").
 */
export function declineStory(d: DeclineRecord, what: string = whatOf(d)): string {
  const reason = d.reason?.replace(/[\s.]+$/, '');
  const first = `${whoOf(d)} declined ${what} ${reason ? `(reason given: ${reason})` : '(no reason given)'}.`;
  const cost = `${costWords(d.costUsd, d.retryCostUsd)}${maybeWords(d)}`;
  const problem = d.problem?.replace(/[\s.]+$/, '');
  switch (d.retry) {
    case 'answered':
      return `${first} byway asked it once more, and it answered. ${cost}`;
    case 'declined':
      return `${first} byway asked it once more, and it declined again. ${cost}`;
    case 'not-made':
      return `${first} byway did not ask it again: ${problem ?? 'it could not'}. ${cost}`;
    case 'failed':
      return `${first} byway asked it once more, but that attempt failed: ${problem ?? 'no answer came'}. ${cost}`;
  }
}

/**
 * Why a step's attempt ended between a decline its caller kept and byway's one retry: the step was stopped. Not an
 * outcome (ADR-0102): the step's next attempt asks for the retry alone.
 */
export function stoppedBeforeRetry(d: Pick<DeclineRecord, 'provider' | 'model' | 'kind'>): string {
  return `The step was stopped after ${whoOf(d)} declined ${whatOf(d)}, so byway did not ask it once more. The step’s next attempt asks it, without buying the declined call again.`;
}

/**
 * Why byway's one retry was not made, from the error that kept it from starting: its admission was refused (a budget with
 * no room, paid calls paused by an accounting fault, the call held by another attempt) or byway did not start it.
 * Undefined for an error that means the retry was sent.
 */
export function notMadeProblem(err: GatewayError): string | undefined {
  switch (err.code) {
    case 'budget-exceeded': {
      const b = err.budget;
      if (!b) return 'another attempt would go over a budget';
      return b.scope === 'run'
        ? `another attempt (estimated at ${usd(b.estimateUsd)}) would take the run over its budget of $${b.capUsd.toFixed(2)}`
        : `another attempt (estimated at ${usd(b.estimateUsd)}) would take your spending over the workspace budget of $${b.capUsd.toFixed(2)}`;
    }
    case 'accounting-fault':
      return 'paid calls are paused until you acknowledge a line in the spend ledger (Settings, Spending records)';
    case 'in-flight':
      return 'another attempt of this call was still under way';
    case 'byway-failure':
      return err.billed === false ? 'byway could not start another call just then' : undefined;
    default:
      return undefined;
  }
}

/**
 * What to do after a decline that brought no answer: rephrase, or choose another model profile, and what a budget needs.
 * Not for a retry billed that byway could not keep: that failure's own words say what follows (the gateway's askOnceMore).
 */
export function declineAdvice(budget?: Pick<BudgetDetails, 'scope'>): string {
  if (budget?.scope === 'run') return 'Rephrase the request, or choose another model profile in Settings, then start again with a larger budget.';
  if (budget?.scope === 'workspace') return 'Rephrase the request, or choose another model profile in Settings, or raise the workspace budget in Settings, then try again.';
  return 'Rephrase the request, or choose another model profile in Settings, then try again.';
}
