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

/**
 * What happened, in plain words: who declined what, the reason they gave, what byway did once more, and what that cost.
 * `what` names the thing declined ("this request", "this image", "the image for shot 2").
 */
export function declineStory(d: DeclineRecord, what: string = d.kind === 'image' ? 'this image' : 'this request'): string {
  const who = `${PROVIDER_NAMES[d.provider] ?? d.provider}’s model ${d.model}`;
  const reason = d.reason?.replace(/[\s.]+$/, '');
  const first = `${who} declined ${what} ${reason ? `(reason given: ${reason})` : '(no reason given)'}.`;
  const both = roundUsd(d.costUsd + (d.retryCostUsd ?? 0));
  const bothCost = both > 0 ? `Both attempts were billed: ${usd(both)} in all.` : 'byway recorded no cost for either attempt.';
  const oneCost = d.costUsd > 0 ? `The declined attempt was billed: ${usd(d.costUsd)}.` : 'byway recorded no cost for the declined attempt.';
  const problem = d.problem?.replace(/[\s.]+$/, '');
  switch (d.retry) {
    case 'answered':
      return `${first} byway asked it once more, and it answered. ${bothCost}`;
    case 'declined':
      return `${first} byway asked it once more, and it declined again. ${bothCost}`;
    case 'not-made':
      return `${first} byway did not ask it again: ${problem ?? 'it could not'}. ${oneCost}`;
    case 'failed':
      return `${first} byway asked it once more, but that attempt failed: ${problem ?? 'no answer came'}. ${oneCost}`;
  }
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

/** What to do after a decline that brought no answer: rephrase, or choose another model profile, and what a budget needs. */
export function declineAdvice(budget?: Pick<BudgetDetails, 'scope'>): string {
  if (budget?.scope === 'run') return 'Rephrase the request, or choose another model profile in Settings, then start again with a larger budget.';
  if (budget?.scope === 'workspace') return 'Rephrase the request, or choose another model profile in Settings, or raise the workspace budget in Settings, then try again.';
  return 'Rephrase the request, or choose another model profile in Settings, then try again.';
}
