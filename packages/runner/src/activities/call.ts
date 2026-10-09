/**
 * One model turn with the spec's parse discipline (§3.3): the answer is parsed by its contract; when it misses (or was
 * cut off at the output limit, stopReason 'max-tokens'), the runner asks once more with the problem appended (and,
 * for a cut-off answer, a larger output allowance). A second miss fails the step with a plain message, unless an
 * answer was well formed but short and its parser said what of it is usable (formats.ts Usable): then that is returned
 * with the problem as its shortfall, for the step to say plainly what is missing (ADR-0090).
 */
import type { ChatMessage, CompletionRequest, ModelRef, PromptSlot, RenderedPrompt, Tier } from '@byway/contracts';
import type { Usable } from '../formats.ts';
import type { RunRef, StepCall } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { ContractMissed, StepError } from './failures.ts';
import { ArtifactReader, userMessage, type ImageGroup } from './prompting.ts';

export interface ModelCall<T> {
  run: RunRef;
  call: StepCall;
  /** Prompt id and slots. */
  promptId: string;
  slots: Partial<Record<PromptSlot, string>>;
  images: ImageGroup[];
  purpose: string;
  tier: Tier;
  /** A model other than the profile's for this tier: a critic from another AI family (FID-1). */
  model?: ModelRef;
  /** What the step is called in a failure message. */
  what: string;
  /** Reads an answer. It gets the rendered prompt too, for what the template declares (an ASSET prompt's image count). */
  parse: (text: string, rendered: RenderedPrompt) => Usable<T> | Promise<Usable<T>>;
  maxOutputTokens?: number;
}

const DEFAULT_MAX_OUTPUT = 16_000;
const MAX_OUTPUT_CEILING = 64_000;
/** A failed answer is quoted back to the model; very long ones are cut, as only the problem matters. */
const QUOTE_LIMIT = 24_000;

export interface ModelAnswer<T> {
  value: T;
  costUsd: number;
  /** Set when the answer fell short even after the retry: the problem; `value` is the usable part of it. */
  shortfall?: string;
}

export async function askModel<T>(deps: RunnerDeps, reader: ArtifactReader, req: ModelCall<T>): Promise<ModelAnswer<T>> {
  if (!deps.prompts.has(req.promptId)) throw new StepError(`The ${req.what} step has no prompt template "${req.promptId}".`);
  let rendered;
  try {
    rendered = deps.prompts.render(req.promptId, req.slots);
  } catch (e) {
    throw new StepError(`The ${req.what} step's prompt "${req.promptId}" could not be filled: ${(e as Error).message}`);
  }
  const first = await userMessage(reader, rendered.user, req.images);
  const base: Omit<CompletionRequest, 'messages' | 'maxOutputTokens'> = {
    workspaceId: req.run.workspaceId,
    runId: req.run.runId,
    stepId: req.call.stepId,
    purpose: req.purpose,
    // Provenance (spec §3.3): the template behind the call goes into the hash-chained ledger entry, retries included.
    prompt: { id: rendered.id, version: rendered.version, hash: rendered.hash, fidelity: rendered.fidelity },
    tier: req.tier,
    ...(req.model ? { model: req.model } : {}),
    profileId: req.run.profileId,
    ...(rendered.system ? { system: rendered.system } : {}),
  };
  let maxOutputTokens = req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT;
  let messages: ChatMessage[] = [first];
  let costUsd = 0;
  let problem = '';
  /** The latest answer that fell short but could be used, with its problem. */
  let usable: { value: T; problem: string } | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await deps.gateway.complete({ ...base, messages, maxOutputTokens });
    costUsd += out.costUsd;
    if (out.stopReason === 'max-tokens') {
      // A cut-off answer is never parsed (it may look complete); ask again from the start with more room.
      problem = `The answer was cut off at the output limit (${maxOutputTokens} tokens).`;
      maxOutputTokens = Math.min(MAX_OUTPUT_CEILING, maxOutputTokens * 2);
      messages = [first];
      continue;
    }
    const parsed = await req.parse(out.text, rendered);
    if (parsed.ok) return { value: parsed.value, costUsd };
    problem = parsed.problem;
    if ('usable' in parsed) usable = { value: parsed.usable, problem };
    messages = [
      first,
      { role: 'assistant', content: [{ type: 'text', text: out.text.slice(0, QUOTE_LIMIT) || '(empty)' }] },
      { role: 'user', content: [{ type: 'text', text: `That answer could not be used: ${problem}\nAnswer again, following the answer format exactly.` }] },
    ];
  }
  if (usable) return { value: usable.value, costUsd, shortfall: usable.problem };
  throw new ContractMissed(`The ${req.what} step's answer could not be used after a retry: ${problem}`, problem);
}
