/**
 * The Run screen's timeline (spec §5): the run's events folded into step rows grouped by Explore / Refine /
 * Finish, each with who did it, its status, cost, rounds and outputs.
 */
import type { CheckpointRecord, RunEvent, RunStatus } from '@byway/contracts';
import { BLOCK_CODES, type BlockCode } from '@byway/protocol';
import { ArtifactData, BudgetData, CheckpointEventData, LoopIterationData, StepFailedData, StepFinishedData, StepStartedData, read } from './events.ts';
import { BLOCK_NAMES, stageFromCode, type StageName, type Who } from './vocabulary.ts';

export type StepStatus = 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'stopped';

export interface TimelineArtifact {
  artifactId: string;
  mediaType?: string;
  label?: string;
  candidate?: number;
  shot?: number;
}

export interface TimelineStep {
  /** Unique per row: a step that runs again (another round) gets a new row. */
  key: string;
  stepId: string;
  /** 1 for the first time the step runs, 2 for the second… */
  round: number;
  label: string;
  block?: BlockCode;
  stage: StageName;
  who: Who;
  status: StepStatus;
  costUsd: number;
  artifacts: TimelineArtifact[];
  /** Loop rounds (e.g. critique passes). */
  iterations: number;
  /** Parallel candidates seen (replicate / each). */
  candidates: number;
  checkpointIds: string[];
  error?: string;
  note?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface TimelineStage {
  stage: StageName;
  steps: TimelineStep[];
}

const ENDED: RunStatus[] = ['done', 'failed', 'cancelled'];

function isBlock(value: string | undefined): value is BlockCode {
  return value !== undefined && (BLOCK_CODES as readonly string[]).includes(value);
}

function whoFrom(data: ReturnType<typeof StepStartedData.parse>): Who {
  if (data.who) return data.who;
  if (data.actor === 'human') return 'you';
  if (data.actor === 'tool' || data.actor === 'policy') return 'tool';
  return 'ai';
}

export function buildTimeline(events: RunEvent[], checkpoints: CheckpointRecord[], runStatus: RunStatus): TimelineStage[] {
  const steps: TimelineStep[] = [];
  const open = new Map<string, TimelineStep>();
  const rounds = new Map<string, number>();
  const candidates = new Map<string, Set<number>>();
  const finished = new Set<TimelineStep>();
  let lastStage: StageName = 'Refine';

  const begin = (stepId: string, at: string, data: unknown): TimelineStep => {
    const d = read(StepStartedData, data);
    const round = (rounds.get(stepId) ?? 0) + 1;
    rounds.set(stepId, round);
    const block = isBlock(d.block) ? d.block : undefined;
    const stage = stageFromCode(d.stage) ?? lastStage;
    lastStage = stage;
    const step: TimelineStep = {
      key: `${stepId}#${round}`,
      stepId,
      round,
      label: d.label ?? (block ? BLOCK_NAMES[block] : stepId),
      ...(block ? { block } : {}),
      stage,
      who: whoFrom(d),
      status: 'running',
      costUsd: 0,
      artifacts: [],
      iterations: 0,
      candidates: 0,
      checkpointIds: [],
      startedAt: at,
    };
    steps.push(step);
    open.set(stepId, step);
    candidates.set(step.key, new Set());
    return step;
  };

  /** Events for a step that never announced itself still get a row. */
  const current = (e: RunEvent): TimelineStep | undefined => {
    if (!e.stepId) return undefined;
    return open.get(e.stepId) ?? begin(e.stepId, e.at, {});
  };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    switch (e.type) {
      case 'step-started': {
        if (!e.stepId) break;
        const existing = open.get(e.stepId);
        // A repeated start while the step is still open is another candidate, not another round.
        if (!existing || finished.has(existing)) begin(e.stepId, e.at, e.data);
        break;
      }
      case 'artifact': {
        const step = current(e);
        const d = read(ArtifactData, e.data);
        if (!step || !d.artifactId) break;
        step.artifacts.push({
          artifactId: d.artifactId,
          ...(d.mediaType ? { mediaType: d.mediaType } : {}),
          ...(d.label ? { label: d.label } : {}),
          ...(e.candidate !== undefined ? { candidate: e.candidate } : {}),
          ...(d.shot !== undefined ? { shot: d.shot } : {}),
        });
        if (e.candidate !== undefined) candidates.get(step.key)?.add(e.candidate);
        break;
      }
      case 'loop-iteration': {
        const step = current(e);
        if (!step) break;
        const d = read(LoopIterationData, e.data);
        step.iterations = Math.max(step.iterations + (d.iteration === undefined ? 1 : 0), d.iteration ?? 0);
        break;
      }
      case 'checkpoint-opened': {
        const step = current(e);
        const d = read(CheckpointEventData, e.data);
        if (step && d.checkpointId && !step.checkpointIds.includes(d.checkpointId)) step.checkpointIds.push(d.checkpointId);
        break;
      }
      case 'step-finished': {
        const step = current(e);
        if (!step) break;
        const d = read(StepFinishedData, e.data);
        step.costUsd += d.costUsd ?? 0;
        step.status = d.skipped ? 'skipped' : 'done';
        if (d.note) step.note = d.note;
        step.finishedAt = e.at;
        finished.add(step);
        break;
      }
      case 'step-failed': {
        const step = current(e);
        if (!step) break;
        const d = read(StepFailedData, e.data);
        step.status = 'failed';
        if (d.error) step.error = d.error;
        step.finishedAt = e.at;
        finished.add(step);
        break;
      }
      default:
        break;
    }
  }

  const openIds = new Set(checkpoints.filter((c) => c.status === 'open').map((c) => c.id));
  for (const cp of checkpoints) {
    const step = [...steps].reverse().find((s) => s.stepId === cp.stepId);
    if (step && !step.checkpointIds.includes(cp.id)) step.checkpointIds.push(cp.id);
  }
  for (const step of steps) {
    step.candidates = candidates.get(step.key)?.size ?? 0;
    if (finished.has(step)) continue;
    if (step.checkpointIds.some((id) => openIds.has(id))) step.status = 'waiting';
    else if (ENDED.includes(runStatus)) step.status = 'stopped';
  }

  // Consecutive steps in the same stage form one group, so the timeline stays chronological.
  const stages: TimelineStage[] = [];
  for (const step of steps) {
    const last = stages.at(-1);
    if (last && last.stage === step.stage) last.steps.push(step);
    else stages.push({ stage: step.stage, steps: [step] });
  }
  return stages;
}

/** The step the run is on: the latest one still running or waiting for you. */
export function currentStep(stages: TimelineStage[]): TimelineStep | undefined {
  const all = stages.flatMap((s) => s.steps);
  return [...all].reverse().find((s) => s.status === 'running' || s.status === 'waiting');
}

export function outputArtifacts(stages: TimelineStage[]): TimelineArtifact[] {
  return stages.flatMap((s) => s.steps.flatMap((step) => step.artifacts));
}

/** The run's budget: the latest value announced by run-started or a budget raise. */
export function budgetFromEvents(events: RunEvent[]): number | undefined {
  let budget: number | undefined;
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.type !== 'run-started' && e.type !== 'cost') continue;
    const d = read(BudgetData, e.data);
    if (d.budgetUsd !== undefined && d.budgetUsd > 0) budget = d.budgetUsd;
  }
  return budget;
}
