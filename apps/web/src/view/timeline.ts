/**
 * The Run screen's timeline (spec §5): the run's events folded into rows grouped by Explore / Refine / Finish.
 *
 * A row is a step as the presentation shows it. One shown step usually stands for several recipe steps (C1's
 * "Outside critique" is a render, a critic and a fix, round after round, for every draft), so events are grouped by
 * the step index (view/steps.ts): everything behind one shown step lands in one row with its plain label, stage and
 * who. A shown step that comes back after other steps ran (C6's draft after its notes) starts another round. Without
 * a presentation (a composed run after a restart) each recipe step is its own row, labelled from its events.
 */
import type { CheckpointRecord, RunEvent, RunStatus } from '@byway/contracts';
import { BLOCK_CODES, type BlockCode } from '@byway/protocol';
import { ArtifactData, CheckpointEventData, LoopIterationData, ModelDeclinedData, RendererSandboxOffData, StepFailedData, StepFinishedData, StepStartedData, read } from './events.ts';
import { isEnded } from './run.ts';
import { shownStep, type ShownStep, type StepIndex } from './steps.ts';
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
  /** Unique per row: a shown step that runs again (another round) gets a new row. */
  key: string;
  /** The first recipe step id seen in this row. */
  stepId: string;
  /** Every recipe node id whose events are in this row, in order of appearance. */
  stepIds: string[];
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
  /** The latest round's judgement in words ("scored 8/10", "ranked 2 of 5"); never shown to a critic. */
  judged?: string;
  /** Parallel candidates seen (replicate / each). */
  candidates: number;
  checkpointIds: string[];
  error?: string;
  /** What the steps said when they finished (why one was skipped, how the critique judged). */
  note?: string;
  /**
   * Recipe steps in this row that finished skipped. A done row with some is only partly done (UX-7: C5's Composite
   * places the product in each scene, but the clean cut-out has no executor), and the Result says what was not done.
   */
  skippedParts: { stepId: string; note?: string }[];
  startedAt: string;
  finishedAt?: string;
}

export interface TimelineStage {
  stage: StageName;
  steps: TimelineStep[];
}

/** Bookkeeping for one row while events are folded in. */
interface Row {
  step: TimelineStep;
  group: string;
  /** Recipe steps started and not yet finished, by "stepId#candidate". */
  open: Set<string>;
  candidates: Set<number>;
  notes: string[];
  finished: number;
  skipped: number;
  /** Set once another shown step has started after this row's steps all finished. */
  closed: boolean;
}

function isBlock(value: string | undefined): value is BlockCode {
  return value !== undefined && (BLOCK_CODES as readonly string[]).includes(value);
}

/** A loop round's judgement in words: a score out of 10 (OK mode), or our place in the lineup (GREAT mode). */
export function judgement(d: { score?: number | undefined; rank?: number | undefined; of?: number | undefined }): string | undefined {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  if (d.rank !== undefined && d.of !== undefined) return `ranked ${fmt(d.rank)} of ${d.of}`;
  if (d.score !== undefined) return `scored ${fmt(d.score)}/10`;
  return undefined;
}

function whoFrom(actor: string | undefined): Who {
  if (actor === 'human') return 'you';
  if (actor === 'tool' || actor === 'policy') return 'tool';
  return 'ai';
}

const micro = (n: number) => Math.round(n * 1e6) / 1e6;

export function buildTimeline(events: RunEvent[], checkpoints: CheckpointRecord[], runStatus: RunStatus, index?: StepIndex | null): TimelineStage[] {
  const rows: Row[] = [];
  const latest = new Map<string, Row>();
  const rounds = new Map<string, number>();
  let lastStage: StageName = 'Refine';

  const groupOf = (stepId: string): { group: string; shown?: ShownStep } => {
    const shown = shownStep(index, stepId);
    return shown ? { group: `shown:${shown.index}`, shown } : { group: `step:${stepId}` };
  };

  const begin = (stepId: string, at: string, data: unknown): Row => {
    const { group, shown } = groupOf(stepId);
    const d = read(StepStartedData, data);
    const round = (rounds.get(group) ?? 0) + 1;
    rounds.set(group, round);
    const block = isBlock(d.block) ? d.block : undefined;
    const stage = shown?.stage ?? stageFromCode(d.stage) ?? lastStage;
    lastStage = stage;
    const row: Row = {
      group,
      open: new Set(),
      candidates: new Set(),
      notes: [],
      finished: 0,
      skipped: 0,
      closed: false,
      step: {
        key: `${group}#${round}`,
        stepId,
        stepIds: [],
        round,
        label: shown?.label ?? d.label ?? (block ? BLOCK_NAMES[block] : stepId),
        ...(block ? { block } : {}),
        stage,
        who: shown?.who ?? whoFrom(d.actor),
        status: 'running',
        costUsd: 0,
        artifacts: [],
        iterations: 0,
        candidates: 0,
        checkpointIds: [],
        skippedParts: [],
        startedAt: at,
      },
    };
    rows.push(row);
    latest.set(group, row);
    return row;
  };

  /** The row an event belongs to: the live row of its shown step, or a new round of it. */
  const rowFor = (e: RunEvent): Row | undefined => {
    if (!e.stepId) return undefined;
    const row = latest.get(groupOf(e.stepId).group);
    const target = row && !row.closed ? row : begin(e.stepId, e.at, e.type === 'step-started' ? e.data : {});
    if (!target.step.stepIds.includes(e.stepId)) target.step.stepIds.push(e.stepId);
    return target;
  };

  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    switch (e.type) {
      case 'step-started': {
        if (!e.stepId) break;
        const { group } = groupOf(e.stepId);
        // Another shown step starting closes every row whose steps have all finished: if one of them starts again
        // later, that is a new round. Rows with steps still running (parallel lenses, candidates) stay open.
        for (const row of latest.values()) if (row.group !== group && row.open.size === 0) row.closed = true;
        const row = rowFor(e);
        if (!row) break;
        const d = read(StepStartedData, e.data);
        if (!row.step.block && isBlock(d.block)) row.step.block = d.block;
        row.open.add(`${e.stepId}#${e.candidate ?? ''}`);
        if (e.candidate !== undefined) row.candidates.add(e.candidate);
        break;
      }
      case 'artifact': {
        const row = rowFor(e);
        const d = read(ArtifactData, e.data);
        if (!row || !d.artifactId) break;
        row.step.artifacts.push({
          artifactId: d.artifactId,
          ...(d.mediaType ? { mediaType: d.mediaType } : {}),
          ...(d.label ? { label: d.label } : {}),
          ...(e.candidate !== undefined ? { candidate: e.candidate } : {}),
          ...(d.shot !== undefined ? { shot: d.shot } : {}),
        });
        if (e.candidate !== undefined) row.candidates.add(e.candidate);
        break;
      }
      case 'loop-iteration': {
        const row = rowFor(e);
        if (!row) break;
        const d = read(LoopIterationData, e.data);
        row.step.iterations = Math.max(row.step.iterations + (d.iteration === undefined ? 1 : 0), d.iteration ?? 0);
        const judged = judgement(d);
        if (judged) row.step.judged = judged;
        break;
      }
      case 'checkpoint-opened': {
        const row = rowFor(e);
        const d = read(CheckpointEventData, e.data);
        if (row && d.checkpointId && !row.step.checkpointIds.includes(d.checkpointId)) row.step.checkpointIds.push(d.checkpointId);
        break;
      }
      case 'step-finished': {
        const row = rowFor(e);
        if (!row) break;
        const d = read(StepFinishedData, e.data);
        row.open.delete(`${e.stepId}#${e.candidate ?? ''}`);
        row.step.costUsd = micro(row.step.costUsd + (d.costUsd ?? 0));
        row.finished++;
        if (d.skipped) {
          row.skipped++;
          const stepId = e.stepId ?? row.step.stepId;
          if (!row.step.skippedParts.some((p) => p.stepId === stepId && p.note === d.note)) row.step.skippedParts.push({ stepId, ...(d.note ? { note: d.note } : {}) });
        }
        if (d.note && !row.notes.includes(d.note)) row.notes.push(d.note);
        row.step.finishedAt = e.at;
        break;
      }
      case 'model-declined': {
        // A decline byway's second ask answered is shown with the row's notes: its cost is in the step's. One that ended
        // the step, or an image, is told by the step's failure or note (ADR-0102).
        const row = rowFor(e);
        const d = read(ModelDeclinedData, e.data);
        if (row && d.retry === 'answered' && d.note && !row.notes.includes(d.note)) row.notes.push(d.note);
        break;
      }
      case 'renderer-sandbox-off': {
        // The step's pages were drawn with the OS sandbox off (ADR-0105): said with the row's notes, once.
        const row = rowFor(e);
        const d = read(RendererSandboxOffData, e.data);
        if (row && d.note && !row.notes.includes(d.note)) row.notes.push(d.note);
        break;
      }
      case 'step-failed': {
        const row = rowFor(e);
        if (!row) break;
        const d = read(StepFailedData, e.data);
        row.open.delete(`${e.stepId}#${e.candidate ?? ''}`);
        row.step.status = 'failed';
        if (d.error) row.step.error = d.error;
        row.step.finishedAt = e.at;
        break;
      }
      default:
        break;
    }
  }

  // Checkpoints the events did not announce still belong to the latest row of their step.
  for (const cp of checkpoints) {
    if (rows.some((r) => r.step.checkpointIds.includes(cp.id))) continue;
    const row = latest.get(groupOf(cp.stepId).group);
    if (row) row.step.checkpointIds.push(cp.id);
  }

  const ended = isEnded(runStatus);
  // A run that ended answers nothing more, whatever the store still lists as open.
  const openIds = new Set(ended ? [] : checkpoints.filter((c) => c.status === 'open').map((c) => c.id));
  for (const row of rows) {
    const { step } = row;
    step.candidates = row.candidates.size;
    if (row.notes.length > 0) step.note = row.notes.join(' ');
    if (step.status === 'failed') continue;
    if (step.checkpointIds.some((id) => openIds.has(id))) step.status = 'waiting';
    else if (row.open.size > 0 || row.finished === 0) step.status = ended ? 'stopped' : 'running';
    else step.status = row.skipped === row.finished ? 'skipped' : 'done';
  }

  // Consecutive rows in the same stage form one group, so the timeline stays chronological.
  const stages: TimelineStage[] = [];
  for (const { step } of rows) {
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
