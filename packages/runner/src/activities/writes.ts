/**
 * Every artifact the runner writes passes the same checks first:
 * - PR3: no SEED string handed out in this run appears in it (the seed is interpreted for direction, never shown);
 * - keepsVoice (port rule 6): a machine write after VOICE keeps the person's lines verbatim.
 * Then it is stored and announced with an `artifact` event.
 */
import type { Medium } from '@byway/contracts';
import { lostVoiceLines } from '../copy.ts';
import { mediaTypeOf } from '../formats.ts';
import type { RunRef, StepCall } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';

/** Problems that keep a text from being written as the run's artifact. */
export function writeProblems(run: Pick<RunRef, 'seeds' | 'medium'>, text: string, voice?: string): string[] {
  const problems: string[] = [];
  if (run.seeds.some((s) => s && text.includes(s))) {
    problems.push('The answer contains the random string it was given. Interpret it for direction, but never write it into the work.');
  }
  if (voice?.trim()) {
    const lost = lostVoiceLines(run.medium, text, voice);
    if (lost.length) problems.push(`The person's own words must stay exactly as written; these lines changed or went missing: ${lost.map((l) => `"${l.slice(0, 80)}"`).join('; ')}.`);
  }
  return problems;
}

export interface StoreOptions {
  label: string;
  /** Distinguishes several artifacts written by one step call (dedupe key suffix). */
  name: string;
  shot?: number;
  mediaType?: string;
}

/** Store a text artifact of the run and emit its `artifact` event. */
export async function storeText(deps: RunnerDeps, run: Pick<RunRef, 'runId' | 'medium'>, call: StepCall, text: string, opts: StoreOptions): Promise<string> {
  const mediaType = opts.mediaType ?? mediaTypeOf(run.medium as Medium);
  const record = await deps.store.artifacts.putText(text, mediaType);
  await announce(deps, run.runId, call, record.id, mediaType, opts);
  return record.id;
}

/** Emit the `artifact` event for an artifact already in the store (generated images, clips, screenshots). */
export async function announce(deps: RunnerDeps, runId: string, call: StepCall, artifactId: string, mediaType: string, opts: Omit<StoreOptions, 'mediaType'>): Promise<void> {
  await emit(deps.store, runId, 'artifact', { artifactId, mediaType, label: opts.label, ...(opts.shot !== undefined ? { shot: opts.shot } : {}) }, at(call, `artifact/${opts.name}`));
}
