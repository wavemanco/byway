/**
 * Human steps and operator questions (spec §3.2): the workflow opens a checkpoint, waits for the person's answer
 * (the RESOLVE_UPDATE Update), and then the answer becomes the step's ports. Writing steps write here: the author's
 * draft becomes the artifact, and VOICE writes the person's copy back (see copy.ts for how, per medium).
 */
import { CheckpointResolvedError, CheckpointWithdrawnError } from '@byway/store';
import { applyCopy, claimLines, extractCopy, pageVoiceProblems, placePageCopy } from '../copy.ts';
import { parseArtifact, parseHtml, type Parsed } from '../formats.ts';
import type { FinishHumanInput, FinishHumanResult, OpenCheckpointInput, OpenCheckpointResult, RecordResolutionInput } from '../types.ts';
import { askModel } from './call.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';
import { StepError } from './failures.ts';
import { ArtifactReader } from './prompting.ts';
import { stepFinished, stepStarted } from './steps.ts';
import { storeText, writeProblems } from './writes.ts';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();

export async function openCheckpoint(deps: RunnerDeps, input: OpenCheckpointInput): Promise<OpenCheckpointResult> {
  const { run, call, checkpoint } = input;
  if (input.step) await stepStarted(deps, run, call, input.step, input.meta);
  let initialText = checkpoint.initialText;
  if (input.initial) {
    const text = input.initial.artifactId ? await deps.store.artifacts.getText(input.initial.artifactId) : '';
    switch (input.initial.from) {
      case 'copy':
        initialText = extractCopy(run.medium, text);
        break;
      case 'artifact':
        initialText = text;
        break;
      case 'claims':
        initialText = claimLines(text);
        break;
      case 'draft':
        initialText = input.initial.draft ?? '';
        break;
    }
  }
  const stored = await deps.store.openCheckpoint({
    id: checkpoint.id,
    runId: run.runId,
    stepId: call.stepId,
    ...(call.candidate !== undefined ? { candidate: call.candidate } : {}),
    kind: checkpoint.kind,
    prompt: checkpoint.prompt,
    ...(checkpoint.options ? { options: checkpoint.options } : {}),
    ...(checkpoint.k !== undefined ? { k: checkpoint.k } : {}),
    ...(initialText !== undefined ? { initialText } : {}),
    ...(checkpoint.artifactIds?.length ? { artifactIds: checkpoint.artifactIds } : {}),
  });
  await emit(deps.store, run.runId, 'checkpoint-opened', { checkpointId: stored.id, kind: stored.kind }, at(call, `checkpoint/${stored.id}/opened`));
  return { checkpointId: stored.id, ...(stored.initialText !== undefined ? { initialText: stored.initialText } : {}) };
}

/** Write the person's answer to the store (the workflow already validated it) and announce it. */
export async function recordResolution(deps: RunnerDeps, input: RecordResolutionInput): Promise<void> {
  try {
    await deps.store.resolveCheckpoint(input.resolution);
  } catch (e) {
    // A withdrawn question (its run was cancelled or failed) takes no answer, and retrying will not change that. It is
    // deliberately not a CheckpointResolvedError, so it never passes for an earlier attempt's success.
    if (e instanceof CheckpointWithdrawnError) throw new StepError('This question was withdrawn: its run was cancelled or failed.');
    // A retried activity whose first attempt committed finds the checkpoint already answered: that is success.
    if (!(e instanceof CheckpointResolvedError)) throw e;
  }
  await emit(deps.store, input.runId, 'checkpoint-resolved', { checkpointId: input.resolution.checkpointId }, at(input.call, `checkpoint/${input.resolution.checkpointId}/resolved`));
}

/** Turn a resolved human step into its outputs: texts back to the workflow, writes into the store. */
export async function finishHumanStep(deps: RunnerDeps, input: FinishHumanInput): Promise<FinishHumanResult> {
  const { run, call, step, resolution, ports } = input;
  const result: FinishHumanResult = { costUsd: 0 };
  const outputs: string[] = [];
  const text = resolution.text ?? '';
  if (input.kind === 'write' && step.role === 'voice' && step.produces.includes('artifact') && ports.artifact) {
    const written = await writeVoice(deps, input, text);
    result.costUsd = written.costUsd;
    result.text = text;
    if (written.artifactId) {
      result.artifactId = written.artifactId;
      outputs.push(written.artifactId);
    }
  } else if (input.kind === 'write' && step.produces.includes('artifact')) {
    // The author's own draft (C3 "your own draft", C6/C6a every sentence): their text is the work.
    const parsed = run.medium === 'prose' ? { ok: true as const, value: `${text.trimEnd()}\n` } : parseArtifact(run.medium, text);
    if (!parsed.ok) throw new StepError(`Your draft could not be used as the ${run.medium}: ${parsed.problem}`);
    const problems = writeProblems(run, parsed.value);
    if (problems.length) throw new StepError(problems.join(' '));
    result.artifactId = await storeText(deps, run, call, parsed.value, { label: 'Your draft', name: 'work' });
    result.text = text;
    outputs.push(result.artifactId);
  } else if (input.kind === 'compare') {
    result.keep = resolution.choice?.[0] === 'A' ? 'A' : 'B';
  } else {
    result.text = text;
  }
  await stepFinished(deps, run, call, { costUsd: result.costUsd, ...(outputs.length ? { outputArtifactIds: outputs } : {}) }, result.costUsd > 0);
  return result;
}

/**
 * VOICE write-back. Unchanged copy writes nothing. Prose: the edited text is the artifact. Options, media and diffs map
 * the copy back field by field. Pages: `helper.voice.apply`, held to a diff check (only text changed, every line of
 * the person's verbatim); when the model's page fails the check but the lines map one to one onto the page's lines,
 * the runner places them itself and the same check verifies it.
 */
async function writeVoice(deps: RunnerDeps, input: FinishHumanInput, edited: string): Promise<{ costUsd: number; artifactId?: string }> {
  const { run, call, step, ports } = input;
  if (input.initialText !== undefined && squash(input.initialText) === squash(edited)) return { costUsd: 0 };
  const reader = new ArtifactReader(deps);
  const before = await reader.text(ports.artifact!);
  const store = async (text: string) => storeText(deps, run, call, text, { label: 'Your words', name: 'work' });
  if (run.medium !== 'web-page') {
    const direct = applyCopy(run.medium, before, edited);
    if (direct.ok) {
      const problems = writeProblems(run, direct.value);
      if (problems.length) throw new StepError(problems.join(' '));
      return { costUsd: 0, artifactId: await store(direct.value) };
    }
    // The copy no longer maps onto the fields: let the model write it in, then hold it to the person's lines.
    const applied = await askModel(deps, reader, {
      run,
      call,
      promptId: 'helper.voice.apply',
      slots: { medium: run.medium, artifact: before, voice: edited },
      images: [],
      purpose: `voice.apply:${run.medium}`,
      tier: 'mid',
      what: 'Your words',
      parse: (text) => {
        const r = parseArtifact(run.medium, text);
        if (!r.ok) return r;
        const problems = writeProblems(run, r.value, edited);
        return problems.length ? { ok: false, problem: problems.join(' ') } : r;
      },
    });
    return { costUsd: applied.costUsd, artifactId: await store(applied.value) };
  }
  const lines = edited.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');
  const check = (page: string): Parsed<string> => {
    const problems = [...pageVoiceProblems(before, page, lines), ...writeProblems(run, page)];
    return problems.length ? { ok: false, problem: problems.join(' ') } : { ok: true, value: page };
  };
  const applied = await askModel(deps, reader, {
    run,
    call,
    promptId: 'helper.voice.apply',
    slots: { medium: run.medium, artifact: before, voice: edited },
    images: [],
    purpose: 'voice.apply:web-page',
    tier: step.tier ?? 'mid',
    what: 'Your words',
    parse: (text) => {
      const page = parseHtml(text);
      const checked = page.ok ? check(page.value) : page;
      if (checked.ok) return checked;
      const placed = placePageCopy(before, lines);
      const fallback = placed.ok ? check(placed.value) : placed;
      return fallback.ok ? fallback : checked;
    },
  });
  return { costUsd: applied.costUsd, artifactId: await store(`${applied.value}\n`) };
}
