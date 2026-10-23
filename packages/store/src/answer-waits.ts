/**
 * Each model's answer wait (AnswerWait; Settings' "How long to wait for an answer"): one row per workspace, provider and
 * model. The store does not know the models, so it takes a wait any kind of model offers; whether the model's own kind
 * offers it is the web API's check, from the gateway's profiles.
 */
import type { SQLOutputValue } from 'node:sqlite';
import type { AnswerWait, ProviderId } from '@byway/contracts';
import { invalid, isPlainObject, nonEmpty, oneOf } from './validate.ts';

/**
 * Every wait some kind of model offers, in minutes: the owner's choices of 2026-10-22, text 15, 30, 45 or 60 ("Build
 * selectable limits for every model/provider: 15, 30, 45, and 60 minutes"), images 5, 10, 15 or 20 ("5, 10, 15, 20;
 * default 15 (Recommended)") and video 30, 45, 60 or 75.
 */
export const ANSWER_WAIT_MINUTES = [5, 10, 15, 20, 30, 45, 60, 75] as const;

/** The providers a wait can name: the contract's ProviderId, every one of them (a new one fails the typecheck below). */
const PROVIDERS = ['anthropic', 'openai', 'google', 'openrouter', 'fal', 'mock'] as const satisfies readonly ProviderId[];
true satisfies [Exclude<ProviderId, (typeof PROVIDERS)[number]>] extends [never] ? true : false;

const WAIT_KEYS = ['provider', 'model', 'minutes'];

/** A choice as the store keeps it: exactly a provider, a model and minutes some kind offers. */
export function answerWait(value: unknown): Omit<AnswerWait, 'changedAt'> {
  if (!isPlainObject(value)) throw invalid('an answer wait must be a plain object');
  const extra = Object.keys(value).filter((k) => !WAIT_KEYS.includes(k));
  if (extra.length > 0) throw invalid(`an answer wait has only ${WAIT_KEYS.join(', ')}; got ${extra.join(', ')}`);
  const minutes = value.minutes;
  if (!(ANSWER_WAIT_MINUTES as readonly unknown[]).includes(minutes)) {
    throw invalid(`an answer wait is one of ${ANSWER_WAIT_MINUTES.join(', ')} minutes, got ${JSON.stringify(minutes) ?? String(minutes)}`);
  }
  return { provider: oneOf('provider', value.provider, PROVIDERS), model: nonEmpty('an answer wait’s model', value.model), minutes: minutes as number };
}

export function toAnswerWait(r: Record<string, SQLOutputValue>): AnswerWait {
  return { provider: String(r.provider) as ProviderId, model: String(r.model), minutes: Number(r.minutes), changedAt: String(r.changed_at) };
}
