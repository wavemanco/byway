/**
 * Settings' "How long to wait for an answer" (the waits design of 2026-10-22; the owner's choices: text 15, 30, 45 or 60
 * minutes, images 5, 10, 15 or 20, video 30, 45, 60 or 75, "Per model (Recommended)"). One row per model the gateway's
 * profiles use (ServiceHost.modelWaits: every profile's, key or no key, the mock's none), grouped by provider, each
 * with the wait the store keeps for it or its kind's default. A wait the store keeps for a model no profile uses is not
 * shown (the store keeps it, in case a profile uses that model again), and one whose minutes the model's kind does not
 * offer reads as not chosen, as the gateway reads it.
 */
import type { AnswerWait, ModelWait, ProviderId, WaitKind } from '@byway/contracts';
import { PROVIDER_NAMES } from './labels.ts';

/** One model's row: what it offers, and what it waits now. */
export interface AnswerWaitRow extends ModelWait {
  /** The minutes the model waits from its next call: the person's choice, or its kind's default. */
  minutes: number;
  /** Whether the person chose it. False: never chosen (a model a profile has just started using, say), so the default. */
  chosen: boolean;
}

export interface AnswerWaitGroup {
  provider: ProviderId;
  /** The provider as people know it. */
  name: string;
  rows: AnswerWaitRow[];
}

/** The kinds as Settings names them. */
export const KIND_WORDS: Readonly<Record<WaitKind, string>> = { text: 'Text', image: 'Images', video: 'Video clips' };

/** Groups in the order Settings lists the providers. */
const PROVIDER_ORDER: readonly ProviderId[] = ['anthropic', 'openai', 'google', 'openrouter', 'fal', 'mock'];

export function answerWaitGroups(models: readonly ModelWait[], stored: readonly AnswerWait[]): AnswerWaitGroup[] {
  const groups = new Map<ProviderId, AnswerWaitRow[]>();
  for (const m of models) {
    if (m.provider === 'mock') continue;
    const kept = stored.find((w) => w.provider === m.provider && w.model === m.model)?.minutes;
    const chosen = kept !== undefined && m.choices.includes(kept) ? kept : undefined;
    const row: AnswerWaitRow = { ...m, minutes: chosen ?? m.defaultMinutes, chosen: chosen !== undefined };
    groups.set(m.provider, [...(groups.get(m.provider) ?? []), row]);
  }
  return [...groups]
    .sort(([a], [b]) => PROVIDER_ORDER.indexOf(a) - PROVIDER_ORDER.indexOf(b))
    .map(([provider, rows]) => ({ provider, name: PROVIDER_NAMES[provider], rows }));
}

/** A choice as its option reads: "15 minutes (default)". */
export const waitOption = (minutes: number, defaultMinutes: number): string => `${minutes} minutes${minutes === defaultMinutes ? ' (default)' : ''}`;

/**
 * What a model waits until someone chooses, by kind, in the rows' order: "15 minutes for text and images, 30 for video
 * clips". Kinds with the same default are named together.
 */
export function defaultsSentence(groups: readonly AnswerWaitGroup[]): string {
  const byMinutes = new Map<number, WaitKind[]>();
  for (const row of groups.flatMap((g) => g.rows)) {
    const kinds = byMinutes.get(row.defaultMinutes) ?? [];
    if (!kinds.includes(row.kind)) byMinutes.set(row.defaultMinutes, [...kinds, row.kind]);
  }
  const parts = [...byMinutes].map(([minutes, kinds], i) => {
    const words = kinds.map((k) => KIND_WORDS[k].toLowerCase());
    const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
    return `${minutes}${i === 0 ? ' minutes' : ''} for ${list}`;
  });
  return parts.join(', ');
}
