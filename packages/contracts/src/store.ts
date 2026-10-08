/**
 * Product persistence (implemented by @byway/store): SQLite for records and a content-addressed artifact store.
 * Product data lives in its own data directory and never feeds a confirmatory study (ADR-0041 rule 3, CR3/CR12).
 */
import type { Medium } from './medium.ts';

export type RunStatus = 'queued' | 'running' | 'waiting' | 'done' | 'failed' | 'cancelled';

export interface Workspace {
  id: string;
  name: string;
  /** Spend cap for the workspace in USD. */
  budgetUsd: number;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  workspaceId: string;
  recipeId: string;
  recipeHash: string;
  profileId: string;
  title: string;
  /** The user's problem, as entered. */
  problem: string;
  medium: Medium;
  status: RunStatus;
  /** The run's spend cap in USD (raised when the user accepts a "Raise the budget" checkpoint). */
  budgetUsd: number;
  /** Final deliverable, when done. */
  outputArtifactId?: string;
  error?: string;
  costUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtifactRecord {
  /** "sha256:<hex>" of the bytes: content-addressed, so identical outputs dedupe. */
  id: string;
  mediaType: string;
  bytes: number;
  createdAt: string;
}

export type RunEventType =
  | 'run-started'
  | 'step-started'
  | 'step-finished'
  | 'step-failed'
  | 'checkpoint-opened'
  | 'checkpoint-resolved'
  | 'artifact'
  | 'loop-iteration'
  | 'cost'
  | 'run-finished'
  | 'run-failed'
  | 'run-cancelled';

export interface RunEvent {
  runId: string;
  seq: number;
  at: string;
  type: RunEventType;
  stepId?: string;
  /** Candidate index inside replicate/each, when relevant. */
  candidate?: number;
  /** Small JSON payload; large content goes to artifacts. */
  data: Record<string, unknown>;
}

export type CheckpointKind =
  /** Choose k options from a set (pick(H,k)). */
  | 'pick'
  /** Free-text reaction or direction (VISION react/sharpen, taste). */
  | 'react'
  /** Yes/no decision (e.g. "Is the design plain?", ship best-so-far at the cap). */
  | 'confirm'
  /** Choose between two versions (TELLS keep-or-revert). */
  | 'compare'
  /** List what to remove (CUT directive). */
  | 'directive'
  /** Write or rewrite text (VOICE; the author's draft in C6/C6a). */
  | 'write'
  /** Choose a route branch. */
  | 'choose';

export interface CheckpointOption {
  id: string;
  label: string;
  artifactId?: string;
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  stepId: string;
  candidate?: number;
  kind: CheckpointKind;
  /** Plain-language question shown to the user. */
  prompt: string;
  options?: CheckpointOption[];
  /** For pick: how many to choose. A resolution must choose exactly k distinct options. */
  k?: number;
  /** For write/directive: starting text (e.g. the copy extracted from the page). */
  initialText?: string;
  /** Artifacts to show alongside (renders, drafts). */
  artifactIds?: string[];
  status: 'open' | 'resolved';
  openedAt: string;
  resolvedAt?: string;
  resolution?: CheckpointResolution;
}

export interface CheckpointResolution {
  checkpointId: string;
  /** pick/choose/compare: chosen option ids. */
  choice?: string[];
  /** react/write/directive: the text. */
  text?: string;
  /** confirm: the answer. */
  approved?: boolean;
}

export interface ArtifactStore {
  put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord>;
  putText(text: string, mediaType: string): Promise<ArtifactRecord>;
  get(id: string): Promise<{ record: ArtifactRecord; bytes: Uint8Array }>;
  getText(id: string): Promise<string>;
  has(id: string): Promise<boolean>;
}

export interface Store {
  readonly artifacts: ArtifactStore;
  ensureDefaultWorkspace(): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  updateWorkspace(id: string, patch: Partial<Pick<Workspace, 'name' | 'budgetUsd'>>): Promise<Workspace>;

  createRun(run: Omit<RunRecord, 'createdAt' | 'updatedAt' | 'costUsd' | 'status'> & { status?: RunStatus }): Promise<RunRecord>;
  /** `null` clears error or outputArtifactId; undefined leaves a field unchanged. */
  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, 'status' | 'costUsd' | 'title' | 'budgetUsd'>> & { error?: string | null; outputArtifactId?: string | null },
  ): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | undefined>;
  listRuns(workspaceId: string, opts?: { limit?: number }): Promise<RunRecord[]>;

  /**
   * Appends an event with the next seq for the run and returns it. With a dedupeKey, a second append with the same
   * key for the same run returns the first event instead (Temporal activities run at least once).
   */
  appendEvent(event: Omit<RunEvent, 'seq' | 'at'>, opts?: { dedupeKey?: string }): Promise<RunEvent>;
  events(runId: string, afterSeq?: number): Promise<RunEvent[]>;

  openCheckpoint(cp: Omit<CheckpointRecord, 'status' | 'openedAt' | 'resolvedAt' | 'resolution'>): Promise<CheckpointRecord>;
  resolveCheckpoint(res: CheckpointResolution): Promise<CheckpointRecord>;
  getCheckpoint(id: string): Promise<CheckpointRecord | undefined>;
  openCheckpoints(workspaceId: string): Promise<CheckpointRecord[]>;
  checkpointsForRun(runId: string): Promise<CheckpointRecord[]>;

  close(): void;
}
