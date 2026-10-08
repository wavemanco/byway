/**
 * Every artifact the runner writes passes the same checks first:
 * - PR3: no SEED string handed out in this run appears in it (the seed is interpreted for direction, never shown);
 * - keepsVoice (port rule 6): a machine write after VOICE leaves the person's copy deck exactly as it was locked
 *   (copy.ts `lockCopy`, ADR-0081). A storyboard's voice-over is written back rather than refused, and the step says so.
 * Then it is stored and announced with an `artifact` event.
 */
import type { Medium } from '@byway/contracts';
import { lockCopy, type LockedWrite } from '../copy.ts';
import { mediaTypeOf } from '../formats.ts';
import type { RunRef, StepCall } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';
import { StepError } from './failures.ts';

/** The PR3 check alone: problems that keep a text from being written as the run's artifact. */
export function writeProblems(run: Pick<RunRef, 'seeds'>, text: string): string[] {
  return run.seeds.some((s) => s && text.includes(s)) ? ['The answer contains the random string it was given. Interpret it for direction, but never write it into the work.'] : [];
}

/** The note a step finishes with when it changed the locked voice-over and the runner wrote it back. */
export const VOICEOVER_KEPT_NOTE = "The voice-over is locked, so it was kept exactly as it was; this step's change to it was undone.";

/** The step-finished note for what a checked write restored, if anything. */
export const restoredNote = (restored: readonly string[]): string | undefined => (restored.includes('voice-over') ? VOICEOVER_KEPT_NOTE : undefined);

export type CheckedWrite = LockedWrite;

/**
 * The checks for a machine write that starts from `before` (keepsVoice passes the person's words as `voice`; other
 * writers pass none). The locked deck is computed now, before any model call, so a fault in the runner's own copy code
 * never repeats a paid call: it is a plain, non-retryable step failure, here or when the returned check runs.
 */
export function checkedWriter(run: Pick<RunRef, 'seeds' | 'medium'>, voice: string | undefined, before: string | undefined): (text: string) => CheckedWrite {
  let check: (after: string) => LockedWrite;
  try {
    check = lockCopy(run.medium, voice, before);
  } catch (e) {
    throw copyFault(e);
  }
  return (text) => {
    let locked: LockedWrite;
    try {
      locked = check(text);
    } catch (e) {
      throw copyFault(e);
    }
    return { ...locked, problems: [...writeProblems(run, locked.text), ...locked.problems] };
  };
}

/** One checked write with nothing paid for in between (a relay link's clip, attached images). */
export const checkedWrite = (run: Pick<RunRef, 'seeds' | 'medium'>, text: string, voice: string | undefined, before: string | undefined): CheckedWrite => checkedWriter(run, voice, before)(text);

const copyFault = (e: unknown): StepError => new StepError(`byway could not check this write against your words (${e instanceof Error ? e.message : String(e)}).`);

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
