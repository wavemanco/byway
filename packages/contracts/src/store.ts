/**
 * Product persistence (implemented by @byway/store): SQLite for records and a content-addressed artifact store.
 * Product data lives in its own data directory and never feeds a confirmatory study (ADR-0041 rule 3, CR3/CR12).
 */
import type { ChooserAnswer, ComposeResult, ProblemBrief, Recommendation } from './advisor.ts';
import type { DeclineRecord } from './gateway.ts';
import type { Medium } from './medium.ts';
import type { SpendBook } from './spend.ts';

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
  | 'run-resumed'
  /** A model declined a call, and byway asked it once more (ADR-0102). */
  | 'model-declined'
  /** A step's pages were drawn with the page renderer's OS sandbox off, as the person set it in Settings (ADR-0105). */
  | 'renderer-sandbox-off';

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
  /**
   * The score (OK mode) or our rank of `of` (GREAT mode) is shown to the user; it never reaches a critic (port rule 2).
   */
  'loop-iteration': { iteration: number; max: number; score?: number; rank?: number; of?: number };
  cost: { totalUsd: number; budgetUsd: number };
  'run-finished': { outputArtifactId: string; costUsd: number };
  'run-failed': { error: string };
  'run-cancelled': Record<string, never>;
  'run-paused': Record<string, never>;
  'run-resumed': Record<string, never>;
  /**
   * One per decline (ADR-0102), written once byway's one retry on the same model has an outcome: who declined what and
   * why, what became of the retry, the two ledger entries and their costs (DeclineRecord), and `note`, the same in plain
   * words. The step's own failure or note says what it means for the run.
   */
  'model-declined': DeclineRecord & { note: string };
  /**
   * Once per step call whose pages (renders, visitor reads, cards) were drawn with the OS sandbox off (ADR-0105): `note`
   * says so in plain words, and the Run and Result screens show it with the step's notes.
   */
  'renderer-sandbox-off': { note: string };
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
  /** Choose any number of options, including none (which TELLS hits to swap, decided per instance). */
  | 'select'
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
  /** For pick: how many to choose. A resolution must choose exactly k distinct options. Unused for select. */
  k?: number;
  /** For write/directive: starting text (e.g. the copy extracted from the page). */
  initialText?: string;
  /** Artifacts to show alongside (renders, drafts). */
  artifactIds?: string[];
  /** 'withdrawn': the run was cancelled or failed while the question was open; it can no longer be answered. */
  status: 'open' | 'resolved' | 'withdrawn';
  openedAt: string;
  resolvedAt?: string;
  /** When the question was withdrawn; set exactly when the status is 'withdrawn'. */
  withdrawnAt?: string;
  resolution?: CheckpointResolution;
}

export interface CheckpointResolution {
  checkpointId: string;
  /** pick/select/choose/compare: chosen option ids (select: any distinct subset, possibly empty). */
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

/**
 * What byway's start-up check of the page renderer found (scripts/serve.ts; ADR-0105). The check draws byway's own test
 * page, with a script, under the setting in force; with the sandbox off it also tries the sandbox, and with the sandbox
 * on and failing it tries without it, to tell whether the sandbox is the cause.
 */
export interface RendererCheckRecord {
  at: string;
  /** The OS sandbox setting the check ran under. */
  osSandbox: boolean;
  /**
   * Whether the renderer could draw the test page under that setting; absent when the check had not found out by the time
   * byway printed its line (the start-up line's limit came first).
   */
  ready?: boolean;
  /**
   * Whether Chromium could start inside its OS sandbox and draw the test page: 'starts', 'fails', or 'unknown' when the
   * check could not tell (Chromium did not start at all, or the check, or its probe of the other setting, ran out of time).
   */
  sandbox: 'starts' | 'fails' | 'unknown';
  /** The plain message, when the renderer was not ready, the sandbox failed, or the check had not finished. */
  message?: string;
  /** When the sandbox failed: why on this computer, and the fix (per operating system). */
  why?: string;
  fix?: string;
}

/**
 * The page renderer's settings: one set for the data directory, since the engine's one renderer serves every workspace
 * (ADR-0105). The engine reads the setting before each page it draws; only Settings writes it.
 */
export interface RendererSettings {
  /** Whether the renderer's Chromium runs inside its OS sandbox: on unless the person switched it off in Settings. */
  osSandbox: boolean;
  /** When the person last switched it; absent if never. */
  changedAt?: string;
  /** What byway's last start-up check found; absent before the first. */
  lastCheck?: RendererCheckRecord;
}

export interface ArtifactStore {
  put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord>;
  putText(text: string, mediaType: string): Promise<ArtifactRecord>;
  get(id: string): Promise<{ record: ArtifactRecord; bytes: Uint8Array }>;
  getText(id: string): Promise<string>;
  has(id: string): Promise<boolean>;
}

/**
 * Methods that take a workspace, run, checkpoint or intake id fail with a not-found error when it is unknown, and with
 * an invalid error when an intake belongs to another workspace.
 */
export interface Store {
  readonly artifacts: ArtifactStore;
  /**
   * The spend book in the same database (contracts v6, ADR-0095): the authority the gateway checks spend caps against,
   * shared by every process on the data directory. Production gateways are given this one.
   */
  readonly spendBook: SpendBook;
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

  openCheckpoint(cp: Omit<CheckpointRecord, 'status' | 'openedAt' | 'resolvedAt' | 'withdrawnAt' | 'resolution'>): Promise<CheckpointRecord>;
  /** Refuses a checkpoint that is not open (resolved or withdrawn). */
  resolveCheckpoint(res: CheckpointResolution): Promise<CheckpointRecord>;
  /** Marks a run's open checkpoints 'withdrawn' (the run was cancelled or failed); returns how many. Idempotent. */
  withdrawCheckpoints(runId: string): Promise<number>;
  getCheckpoint(id: string): Promise<CheckpointRecord | undefined>;
  /** Only checkpoints with status 'open'. */
  openCheckpoints(workspaceId: string): Promise<CheckpointRecord[]>;
  checkpointsForRun(runId: string): Promise<CheckpointRecord[]>;

  createIntake(intake: Omit<IntakeRecord, 'createdAt' | 'updatedAt'>): Promise<IntakeRecord>;
  updateIntake(id: string, patch: Partial<Pick<IntakeRecord, 'problem' | 'answers' | 'recommendation' | 'composed'>>): Promise<IntakeRecord>;
  getIntake(id: string): Promise<IntakeRecord | undefined>;

  /**
   * An idempotency memo for at-least-once activities: a value (e.g. the artifact id of a model call's answer) by key
   * within a run, so a retried activity reuses what was already bought instead of paying again. Set is first-write-wins.
   */
  getMemo(runId: string, key: string): Promise<string | undefined>;
  setMemo(runId: string, key: string, value: string): Promise<string>;

  /** Defaults when never set: profileId 'balanced', demoMode false, showTechnicalNames false. */
  getPreferences(workspaceId: string): Promise<Preferences>;
  setPreferences(workspaceId: string, patch: Partial<Preferences>): Promise<Preferences>;

  /** The page renderer's settings (ADR-0105). Never set: the OS sandbox on, and no check recorded. */
  getRendererSettings(): Promise<RendererSettings>;
  /**
   * The person's OS sandbox choice from Settings, the only way it is switched (ADR-0105): byway never switches it by
   * itself, off or on.
   */
  setRendererSandbox(on: boolean): Promise<RendererSettings>;
  /** What byway's start-up check found. It never changes the setting. */
  recordRendererCheck(check: RendererCheckRecord): Promise<RendererSettings>;

  close(): void;
}
