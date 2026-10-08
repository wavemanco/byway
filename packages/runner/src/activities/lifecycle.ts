/**
 * Run-level activities: the run's status and terminal events, operator events the workflow emits itself, skipped
 * steps, best-snapshot re-ranks and budget raises.
 */
import type { RunStatus } from '@byway/contracts';
import { textView } from '../formats.ts';
import { labelled, labels } from '../labels.ts';
import { parseChoice } from '../parse.ts';
import type { BudgetRaiseInput, FailRunInput, FinishRunInput, RerankInput, RerankResult, SkipInput, WorkflowEvent } from '../types.ts';
import { askModel } from './call.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit } from './events.ts';
import { ArtifactReader, type ImageGroup } from './prompting.ts';
import { stepFinished, stepStarted } from './steps.ts';

const ENDED: ReadonlySet<RunStatus> = new Set(['done', 'failed', 'cancelled']);

export async function beginRun(deps: RunnerDeps, input: { runId: string; recipeId: string; profileId: string; budgetUsd: number }): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (run && run.status === 'queued') await deps.store.updateRun(input.runId, { status: 'running' });
  await emit(deps.store, input.runId, 'run-started', { recipeId: input.recipeId, profileId: input.profileId, budgetUsd: input.budgetUsd }, { dedupeKey: `${input.runId}/run-started` });
}

/** running, waiting or paused; a run that has ended keeps its final status. */
export async function setRunStatus(deps: RunnerDeps, input: { runId: string; status: Extract<RunStatus, 'running' | 'waiting' | 'paused'> }): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (!run || ENDED.has(run.status) || run.status === input.status) return;
  await deps.store.updateRun(input.runId, { status: input.status });
}

export async function emitEvents(deps: RunnerDeps, input: { runId: string; events: WorkflowEvent[] }): Promise<void> {
  for (const e of input.events) {
    await emit(deps.store, input.runId, e.type, e.data as never, { ...(e.stepId !== undefined ? { stepId: e.stepId } : {}), ...(e.candidate !== undefined ? { candidate: e.candidate } : {}), dedupeKey: e.dedupeKey });
  }
}

/** A step with no v1 executor, or one that cannot run with the keys present: it finishes as skipped and says why. */
export async function skipStep(deps: RunnerDeps, input: SkipInput): Promise<void> {
  await stepStarted(deps, input.run, input.call, input.step, input.meta);
  await stepFinished(deps, input.run, input.call, { costUsd: 0, skipped: true, note: input.note });
}

/**
 * Best-snapshot selection (02 §2): the top snapshots side by side in a separate, fresh judge call, with no scores or
 * critiques attached (the one default exception to port rule 1). Purpose `rerank:<medium>`.
 */
export async function rerank(deps: RunnerDeps, input: RerankInput): Promise<RerankResult> {
  const { run, call } = input;
  const reader = new ArtifactReader(deps);
  await emit(deps.store, run.runId, 'step-started', { label: 'Best version', stage: call.stage, role: 'rerank', actor: 'model' }, at(call, 'step-started'));
  const texts: string[] = [];
  const images: ImageGroup[] = [];
  for (const [i, s] of input.snapshots.entries()) {
    const ids = s.view?.imageArtifactIds ?? [];
    if (ids.length) images.push({ label: labels(input.snapshots.length)[i], artifactIds: ids });
    texts.push(s.view?.textArtifactId ? await reader.text(s.view.textArtifactId) : ids.length ? '' : textView(run.medium, await reader.text(s.artifactId)));
  }
  const shown = labels(input.snapshots.length);
  const answer = await askModel(deps, reader, {
    run,
    call,
    promptId: 'helper.rerank',
    slots: { medium: run.medium, view: texts.some((t) => t.trim()) ? labelled(texts.map((t) => t || '(see the images under this label)')) : '' },
    images,
    purpose: `rerank:${run.medium}`,
    tier: 'big',
    what: 'Best version',
    maxOutputTokens: 4_000,
    parse: (text) => parseChoice(text, shown),
  });
  await stepFinished(deps, run, call, { costUsd: answer.costUsd, outputArtifactIds: [input.snapshots[shown.indexOf(answer.value)]!.artifactId] }, true);
  return { costUsd: answer.costUsd, index: shown.indexOf(answer.value) };
}

/**
 * "Raise the budget by $X?" approved: the run's (or the workspace's) cap goes up by X. Idempotent across activity
 * retries: the target is fixed by the first attempt's cost event (its dedupe key), and later attempts only make sure
 * the cap reached it.
 */
export async function raiseBudget(deps: RunnerDeps, input: BudgetRaiseInput): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (!run) throw new Error(`no run ${input.runId}`);
  if (input.scope === 'run') {
    const ev = await emit(deps.store, input.runId, 'cost', { totalUsd: run.costUsd, budgetUsd: run.budgetUsd + input.amountUsd }, { dedupeKey: input.dedupeKey });
    const target = typeof ev?.data.budgetUsd === 'number' ? ev.data.budgetUsd : run.budgetUsd + input.amountUsd;
    if (run.budgetUsd < target) await deps.store.updateRun(input.runId, { budgetUsd: target });
    return;
  }
  const ws = await deps.store.getWorkspace(input.workspaceId);
  if (!ws) throw new Error(`no workspace ${input.workspaceId}`);
  const ev = await deps.store.appendEvent(
    { runId: input.runId, type: 'cost', data: { totalUsd: run.costUsd, budgetUsd: run.budgetUsd, workspaceBudgetUsd: ws.budgetUsd + input.amountUsd } },
    { dedupeKey: input.dedupeKey },
  );
  const target = typeof ev.data.workspaceBudgetUsd === 'number' ? ev.data.workspaceBudgetUsd : ws.budgetUsd + input.amountUsd;
  if (ws.budgetUsd < target) await deps.store.updateWorkspace(input.workspaceId, { budgetUsd: target });
}

async function ledgerCost(deps: RunnerDeps, runId: string, workspaceId: string, fallback: number): Promise<number> {
  const spend = await deps.gateway.spend(workspaceId);
  return Math.max(fallback, spend.byRun[runId] ?? 0);
}

export async function finishRun(deps: RunnerDeps, input: FinishRunInput): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (!run) throw new Error(`no run ${input.runId}`);
  const costUsd = await ledgerCost(deps, input.runId, input.workspaceId, run.costUsd);
  if (!ENDED.has(run.status)) await deps.store.updateRun(input.runId, { status: 'done', outputArtifactId: input.outputArtifactId, costUsd, error: null });
  await emit(deps.store, input.runId, 'run-finished', { outputArtifactId: input.outputArtifactId, costUsd }, { dedupeKey: `${input.runId}/run-finished` });
}

/**
 * A failed or cancelled run withdraws the questions it left open (contracts v4 Runner semantics): nobody will act on an
 * answer, and the app's "Your turn" list must not offer them. Withdrawing is idempotent, so a retried activity is safe.
 */
export async function failRun(deps: RunnerDeps, input: FailRunInput): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (!run) throw new Error(`no run ${input.runId}`);
  const costUsd = await ledgerCost(deps, input.runId, input.workspaceId, run.costUsd);
  if (!ENDED.has(run.status)) await deps.store.updateRun(input.runId, { status: 'failed', error: input.error, costUsd });
  await deps.store.withdrawCheckpoints(input.runId);
  await emit(deps.store, input.runId, 'run-failed', { error: input.error }, { dedupeKey: `${input.runId}/run-failed` });
}

export async function cancelRun(deps: RunnerDeps, input: { runId: string; workspaceId: string }): Promise<void> {
  const run = await deps.store.getRun(input.runId);
  if (!run) throw new Error(`no run ${input.runId}`);
  const costUsd = await ledgerCost(deps, input.runId, input.workspaceId, run.costUsd);
  if (!ENDED.has(run.status)) await deps.store.updateRun(input.runId, { status: 'cancelled', costUsd });
  await deps.store.withdrawCheckpoints(input.runId);
  await emit(deps.store, input.runId, 'run-cancelled', {}, { dedupeKey: `${input.runId}/run-cancelled` });
}
