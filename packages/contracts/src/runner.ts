/**
 * The runner (implemented by @byway/runner): a durable Temporal interpreter that executes recipe files (ADR-0029).
 * The product app is a Temporal client; the worker runs activities that call the gateway, render views and store artifacts.
 */
import type { Recipe } from '@byway/recipe';
import type { ProblemBrief } from './advisor.ts';
import type { CheckpointRecord, CheckpointResolution, RunEvent, RunRecord } from './store.ts';

export interface StartRunInput {
  workspaceId: string;
  recipe: Recipe;
  problem: ProblemBrief;
  profileId: string;
  /** Per-run spend cap in USD; the gateway refuses calls beyond it. */
  budgetUsd: number;
  /**
   * Route choices made up front, by route node id (e.g. { entry: 'seed' }). Routes without a choice open a
   * 'choose' checkpoint when reached.
   */
  routes?: Record<string, string>;
  /** The intake the run starts from, if any (recorded on the RunRecord). */
  intakeId?: string;
  /** User-supplied inputs for ports the recipe declares as inputs (e.g. refs, a fixed copy deck, a draft). */
  inputs?: { refs?: string[]; voice?: string; draft?: string; tells?: string };
}

export interface RunView {
  run: RunRecord;
  events: RunEvent[];
  checkpoints: CheckpointRecord[];
}

/**
 * Control semantics: an unknown run id throws; cancel, pause and resume on a run that has ended do nothing; an answer
 * (resolve) is accepted while the run is paused and the run carries on when resumed. Cancelling or failing a run
 * withdraws its open checkpoints (Store.withdrawCheckpoints).
 */
export interface Runner {
  start(input: StartRunInput): Promise<RunRecord>;
  resolve(resolution: CheckpointResolution): Promise<void>;
  cancel(runId: string): Promise<void>;
  /** Pause between steps (the current step finishes); status becomes 'paused'. */
  pause(runId: string): Promise<void>;
  resume(runId: string): Promise<void>;
  view(runId: string, afterSeq?: number): Promise<RunView>;
}

/** Temporal coordinates shared by the worker and clients. */
export const TASK_QUEUE = 'byway-runs';
export const RESOLVE_UPDATE = 'resolveCheckpoint';
export const CANCEL_SIGNAL = 'cancelRun';
export const PAUSE_SIGNAL = 'pauseRun';
export const RESUME_SIGNAL = 'resumeRun';
export const DEFAULT_TEMPORAL_ADDRESS = '127.0.0.1:7233';
