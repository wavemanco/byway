/**
 * Step bookkeeping shared by every executor: the plain label a step is shown under, and its step-started and
 * step-finished events (spec §3.2: "Every step emits step-started/step-finished events with cost").
 */
import { BLOCK_NAMES, stepPresentation } from '@byway/catalog';
import type { RunEventPayloads } from '@byway/contracts';
import type { RunRef, StepCall, StepMeta, StepSpec } from '../types.ts';
import type { RunnerDeps } from './deps.ts';
import { at, emit, recordCost } from './events.ts';

const ROLE_NAMES: Record<string, string> = {
  build: 'Draft',
  fix: 'Revise',
  critic: 'Outside critique',
  judge: 'Judge',
  seed: 'Random spark',
  vision: 'Your direction',
  asset: 'Custom imagery',
  relay: 'Motion',
  cut: 'Trim',
  'tells-sweep': 'Cliché sweep',
  'tells-compare': 'Keep or revert',
  voice: 'Your words',
  check: 'Defect check',
  render: 'Render',
  select: 'Select',
  dedupe: 'Remove near-duplicates',
  overlap: 'Obvious-answer check',
  pick: 'Pick',
  rerank: 'Best version',
};

/** The shown label: the recipe's presentation when it has one, else the block's plain name, else the role's. */
export function labelFor(deps: RunnerDeps, recipeId: string, step: Pick<StepSpec, 'id' | 'role' | 'block'>): string {
  return deps.labelFor?.(recipeId, step.id) ?? stepPresentation(recipeId, step.id)?.label ?? (step.block ? BLOCK_NAMES[step.block] : undefined) ?? ROLE_NAMES[step.role] ?? step.role;
}

export async function stepStarted(deps: RunnerDeps, run: RunRef, call: StepCall, step: StepSpec, meta?: StepMeta): Promise<void> {
  if (meta?.started === false) return;
  const data: RunEventPayloads['step-started'] = {
    label: meta?.label ?? labelFor(deps, run.recipeId, step),
    stage: call.stage,
    role: step.role,
    actor: step.actor,
    ...(step.block ? { block: step.block } : {}),
    ...(step.glue ? { glue: step.glue } : {}),
  };
  await emit(deps.store, run.runId, 'step-started', data, at(call, 'step-started'));
}

/** step-finished, then (for steps that called the gateway) the run's cost from the ledger. */
export async function stepFinished(deps: RunnerDeps, run: RunRef, call: StepCall, data: RunEventPayloads['step-finished'], calledGateway = false): Promise<void> {
  await emit(deps.store, run.runId, 'step-finished', data, at(call, 'step-finished'));
  if (calledGateway) await recordCost(deps.store, deps.gateway, run.runId, run.workspaceId, call);
}
