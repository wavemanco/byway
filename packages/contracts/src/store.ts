/**
 * Product persistence (implemented by @byway/store): SQLite for records and a content-addressed artifact store.
 * Product data lives in its own data directory and never feeds a confirmatory study (ADR-0041 rule 3, CR3/CR12).
 */
import type { ChooserAnswer, ComposeResult, ProblemBrief, Recommendation } from './advisor.ts';
import type { Medium } from './medium.ts';

export type RunStatus = 'queued' | 'running' | 'waiting' | 'paused' | 'done' | 'failed' | 'cancelled';

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
  /** The intake this run started from (problem, answers, composed recipe), for labels and presentation after a restart. */
  intakeId?: string;
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
  | 'run-cancelled'
  | 'run-paused'
  | 'run-resumed';

/**
 * The payload each event type carries (RunEvent.data). The runner emits exactly these; the app reads them. Extra keys
 * are allowed but not relied on.
 */
export interface RunEventPayloads {
  'run-started': { recipeId: string; profileId: string; budgetUsd: number };
  'step-started': { label: string; stage: 'D1' | 'D2' | 'D3'; role: string; actor: 'model' | 'human' | 'policy' | 'tool'; block?: string; glue?: string };
  'step-finished': { costUsd: number; skipped?: boolean; note?: string; outputArtifactIds?: string[] };
  'step-failed': { error: string; retryable: boolean };
  'checkpoint-opened': { checkpointId: string; kind: CheckpointKind };
  'checkpoint-resolved': { checkpointId: string };
  artifact: { artifactId: string; mediaType: string; label: string; shot?: number };
  /** The score is shown to the user; it never reaches a critic (port rule 2). */
  'loop-iteration': { iteration: number; max: number; score?: number };
  cost: { totalUsd: number; budgetUsd: number };
  'run-finished': { outputArtifactId: string; costUsd: number };
  'run-failed': { error: string };
  'run-cancelled': Record<string, never>;
  'run-paused': Record<string, never>;
  'run-resumed': Record<string, never>;
}

/** A RunEvent whose data is typed by its event type. */
export type TypedRunEvent<T extends RunEventType = RunEventType> = Omit<RunEvent, 'type' | 'data'> & { type: T; data: RunEventPayloads[T] };

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

/** What the user brought before a run starts: the problem, the chooser answers they set, and what the advisor proposed. */
export interface IntakeRecord {
  id: string;
  workspaceId: string;
  problem: ProblemBrief;
  answers?: ChooserAnswer[];
  recommendation?: Recommendation;
  /** A composed recipe offered for this problem (its recipe is the one a run starts with). */
  composed?: ComposeResult;
  createdAt: string;
  updatedAt: string;
}

/** Per-workspace preferences from Settings. */
export interface Preferences {
  profileId: string;
  /** Force the mock provider even when keys exist. */
  demoMode: boolean;
  showTechnicalNames: boolean;
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

  createIntake(intake: Omit<IntakeRecord, 'createdAt' | 'updatedAt'>): Promise<IntakeRecord>;
  updateIntake(id: string, patch: Partial<Pick<IntakeRecord, 'problem' | 'answers' | 'recommendation' | 'composed'>>): Promise<IntakeRecord>;
  getIntake(id: string): Promise<IntakeRecord | undefined>;

  /** Defaults when never set: profileId 'balanced', demoMode false, showTechnicalNames false. */
  getPreferences(workspaceId: string): Promise<Preferences>;
  setPreferences(workspaceId: string, patch: Partial<Preferences>): Promise<Preferences>;

  close(): void;
}
