/**
 * What the workflow and the activities exchange. Pure types and constants only: the workflow bundle imports this
 * module, so nothing here may touch Node.
 *
 * Port values travel by reference (spec §3: "Workflow state holds port values by reference (artifact ids, short
 * texts); activities do all I/O"): artifacts, views and images are artifact ids; briefs, critiques, tastes and the
 * human's words are short texts.
 */
import type { CheckpointKind, CheckpointOption, CheckpointResolution, Medium, ProblemBrief, RunEventPayloads, RunEventType, RunStatus } from '@byway/contracts';
import type { PortType } from '@byway/protocol';
import type { Recipe, Step } from '@byway/recipe';

/** The workflow type name the client starts. */
export const RUN_WORKFLOW = 'runRecipe';

/** Workflow id of a run: one workflow per run, so the run id finds it. */
export const workflowIdFor = (runId: string): string => `byway-run-${runId}`;

/** What the client hands the workflow when it starts a run. */
export interface RunInput {
  runId: string;
  workspaceId: string;
  recipe: Recipe;
  problem: ProblemBrief;
  profileId: string;
  budgetUsd: number;
  medium: Medium;
  /** Route choices made up front, by route id. */
  routes: Record<string, string>;
  inputs: { refs?: string[]; voice?: string; draft?: string; tells?: string };
}

export type StageName = 'D1' | 'D2' | 'D3';

/** A way a web page is seen (RENDER-1): the whole page on a wide screen, on a phone, and the first screen. */
export type Surface = 'desktop' | 'mobile' | 'fold';

/** One view of one artifact: a text rendering, images (screenshot tiles, storyboard frames), or both (media). */
export interface ViewRef {
  textArtifactId?: string;
  /** Every image of the view, in order (for a web page: each surface's screenshots, surface after surface). */
  imageArtifactIds: string[];
  /** A web page's images by surface, so prompts can attach them under their names and a step's `renders` knob can pick. */
  surfaces?: { surface: Surface; imageArtifactIds: string[] }[];
}

/** The `view` port: one artifact's view, or a pool of candidates' views shown side by side under labels A, B, C… */
export interface View {
  pool: boolean;
  items: ViewRef[];
}

/** What a critic said about the work: a score out of 10 (OK mode) or our place in a lineup (GREAT mode). */
export type Score = { kind: 'score'; value: number } | { kind: 'rank'; rank: number; of: number };

/** Port values by reference. Only `artifact`, `options`, `view` and the texts are ever large in meaning, never in size. */
export interface Ports {
  brief?: string;
  /** The current work: an artifact id in the recipe medium's format. */
  artifact?: string;
  /** The work before its latest write, for keep-or-revert comparisons (TELLS). */
  previousArtifact?: string;
  view?: View;
  critique?: string;
  score?: Score;
  taste?: string;
  /** The human's own words (VOICE), kept so later machine writes can be held to them (keepsVoice). */
  voice?: string;
  /** option_set<artifact>: candidate artifact ids, labelled A, B, C… in order. */
  options?: string[];
  /** The latest view of each candidate, aligned with `options` (renders shown at a pick). */
  optionViews?: (ViewRef | undefined)[];
  anchor?: string;
  asset?: string[];
  /** Notes shown beside the work (critiques, flags, a model's direction): artifact ids of the latest ones. */
  notes?: string[];
  /** The storyboard shot a relay link is making (1-based shot number). */
  shot?: number;
  /** The anchor a relay link started from; every relay step of that link (a regeneration too) starts there. */
  linkStart?: string;
  /** The artifact the author last wrote themselves (C3, C6, C6a), which their next write revises. */
  authored?: string;
  /**
   * The critique is an empty CUT directive ("Nothing to remove.", or a person who listed nothing): the fix that
   * consumes it makes no change. Cleared by the next critique and by that fix.
   */
  nothingToRemove?: boolean;
}

/** One execution of one step (or operator) at one place in the run: the base of every dedupe key it uses. */
export interface StepCall {
  /** `<runId>/<stepId>/<candidate path>/<occurrence>`: stable across activity retries and replays. */
  key: string;
  stepId: string;
  /** The innermost candidate index (replicate/each), recorded on events and checkpoints. */
  candidate?: number;
  stage: StageName;
}

/** The run facts every activity needs. */
export interface RunRef {
  runId: string;
  workspaceId: string;
  recipeId: string;
  profileId: string;
  medium: Medium;
  problem: ProblemBrief;
  /** Every SEED string handed out so far: no artifact may contain one (PR3). */
  seeds: string[];
}

/** The parts of a recipe step the activities read. */
export type StepSpec = Pick<Step, 'id' | 'role' | 'block' | 'glue' | 'actor' | 'tier' | 'isolated' | 'frozenPrompt' | 'prompt' | 'consumes' | 'produces' | 'writes' | 'keepsVoice' | 'knobs' | 'variant'>;

export const toStepSpec = (s: Step): StepSpec => ({
  id: s.id,
  role: s.role,
  ...(s.block ? { block: s.block } : {}),
  ...(s.glue ? { glue: s.glue } : {}),
  actor: s.actor,
  ...(s.tier ? { tier: s.tier } : {}),
  ...(s.isolated !== undefined ? { isolated: s.isolated } : {}),
  ...(s.frozenPrompt !== undefined ? { frozenPrompt: s.frozenPrompt } : {}),
  ...(s.prompt ? { prompt: s.prompt } : {}),
  consumes: s.consumes,
  produces: s.produces,
  ...(s.writes !== undefined ? { writes: s.writes } : {}),
  ...(s.keepsVoice !== undefined ? { keepsVoice: s.keepsVoice } : {}),
  ...(s.knobs ? { knobs: s.knobs } : {}),
  ...(s.variant ? { variant: s.variant } : {}),
});

export const consumes = (s: Pick<StepSpec, 'consumes'>, port: PortType): boolean => s.consumes.includes(port);
export const produces = (s: Pick<StepSpec, 'produces'>, port: PortType): boolean => s.produces.includes(port);

// ---- Activity inputs and results -------------------------------------------------------------------------------

export interface StepMeta {
  /** Plain label for the step-started event; defaults to the catalog presentation or the role. */
  label?: string;
  /** Emit step-started (false when an earlier activity of the same step already did, e.g. a checkpoint). */
  started?: boolean;
}

export interface ModelStepInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  ports: Ports;
  /** Loop round, 1-based, when the step runs inside a loop. */
  round?: number;
  /** User-supplied reference artifacts (CRITIC lineups). */
  refs: string[];
  /** The tell catalog text when the run supplies its own (StartRunInput.inputs.tells). */
  tells?: string;
  /** For pick(C): the candidates to choose among, labelled A, B, C… (the judge step's options). */
  candidates?: string[];
  meta?: StepMeta;
}

export interface ModelStepResult {
  costUsd: number;
  /** A builder's new artifact. */
  artifactId?: string;
  /** A judging step's critique, check defects, CUT directive, sweep hits, flags, or a model VISION text. */
  text?: string;
  score?: Score;
  /** check: true when the answer was "No defects." */
  clean?: boolean;
  /** judge/select: the chosen label. */
  label?: string;
  /** tells-compare (model): which version to keep. */
  keep?: 'A' | 'B';
  /** dedupe: the labels kept, in order. */
  keepLabels?: string[];
  /** A SEED string handed to this step, for the run's PR3 checks. */
  seed?: string;
  /** Set when the step ran differently from the recipe as written (ADR-0071 critic fallback). */
  note?: string;
  /** The note this step stored (its critique, flags or direction as text), shown to the person beside the work. */
  noteArtifactId?: string;
  /** The critic's mode as it actually ran. */
  criticMode?: 'OK' | 'GREAT';
  /** cut: the answer was "Nothing to remove." (an empty directive). */
  nothingToRemove?: boolean;
}

export interface RenderInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  /** The artifacts to view: one, or a pool of candidates. */
  artifactIds: string[];
  pool: boolean;
  meta?: StepMeta;
}

export interface RenderResult {
  view: View;
}

export interface AssetInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  ports: Ports;
  meta?: StepMeta;
}

export interface AssetResult {
  costUsd: number;
  artifactId?: string;
  asset?: string[];
  anchor?: string;
  skipped?: boolean;
}

export interface RelayInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  ports: Ports;
  /** The shot this link makes. */
  shot: number;
  meta?: StepMeta;
}

export interface RelayResult {
  costUsd: number;
  artifactId?: string;
  anchor?: string;
  skipped?: boolean;
}

export interface SkipInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  note: string;
  meta?: StepMeta;
}

/** A checkpoint the workflow asks the activities to open. Ids are deterministic, so a retried open is idempotent. */
export interface CheckpointSpec {
  id: string;
  kind: CheckpointKind;
  prompt: string;
  options?: CheckpointOption[];
  k?: number;
  initialText?: string;
  artifactIds?: string[];
}

export interface OpenCheckpointInput {
  run: RunRef;
  call: StepCall;
  checkpoint: CheckpointSpec;
  /** For a human step: its spec, so step-started is emitted with the checkpoint. Absent for operator checkpoints. */
  step?: StepSpec;
  meta?: StepMeta;
  /** Ask the activity to compute the initial text (VOICE copy, the author's draft) from these. */
  initial?: { from: 'copy' | 'artifact' | 'draft' | 'claims'; artifactId?: string; draft?: string };
}

export interface OpenCheckpointResult {
  checkpointId: string;
  initialText?: string;
}

export interface RecordResolutionInput {
  runId: string;
  call: StepCall;
  resolution: CheckpointResolution;
}

export interface FinishHumanInput {
  run: RunRef;
  call: StepCall;
  step: StepSpec;
  kind: CheckpointKind;
  resolution: CheckpointResolution;
  ports: Ports;
  /** The text the checkpoint offered, for "unchanged" detection. */
  initialText?: string;
}

export interface FinishHumanResult {
  costUsd: number;
  artifactId?: string;
  text?: string;
  /** compare: the version kept. */
  keep?: 'A' | 'B';
}

export interface RerankInput {
  run: RunRef;
  call: StepCall;
  /** Snapshots in the order shown, labelled A, B, C… */
  snapshots: { artifactId: string; view?: ViewRef }[];
}

export interface RerankResult {
  costUsd: number;
  index: number;
}

/** An event the workflow itself emits (operator events, pause and resume), with its dedupe key. */
export type WorkflowEvent = {
  [T in RunEventType]: { type: T; stepId?: string; candidate?: number; data: RunEventPayloads[T]; dedupeKey: string };
}[RunEventType];

export interface BudgetRaiseInput {
  runId: string;
  workspaceId: string;
  scope: 'run' | 'workspace';
  amountUsd: number;
  dedupeKey: string;
}

export interface FinishRunInput {
  runId: string;
  workspaceId: string;
  outputArtifactId: string;
}

export interface FailRunInput {
  runId: string;
  workspaceId: string;
  error: string;
}

/** Everything the workflow calls. Implemented by `createActivities`. */
export interface RunnerActivities {
  beginRun(input: { runId: string; recipeId: string; profileId: string; budgetUsd: number }): Promise<void>;
  setRunStatus(input: { runId: string; status: Extract<RunStatus, 'running' | 'waiting' | 'paused'> }): Promise<void>;
  emitEvents(input: { runId: string; events: WorkflowEvent[] }): Promise<void>;
  modelStep(input: ModelStepInput): Promise<ModelStepResult>;
  renderView(input: RenderInput): Promise<RenderResult>;
  assetStep(input: AssetInput): Promise<AssetResult>;
  relayLink(input: RelayInput): Promise<RelayResult>;
  storyboardShots(input: { artifactId: string }): Promise<number[]>;
  skipStep(input: SkipInput): Promise<void>;
  /** A step with nothing to do: it finishes at once, the work unchanged, with a note (not skipped: it had no work). */
  passStep(input: SkipInput): Promise<void>;
  openCheckpoint(input: OpenCheckpointInput): Promise<OpenCheckpointResult>;
  recordResolution(input: RecordResolutionInput): Promise<void>;
  finishHumanStep(input: FinishHumanInput): Promise<FinishHumanResult>;
  rerank(input: RerankInput): Promise<RerankResult>;
  raiseBudget(input: BudgetRaiseInput): Promise<void>;
  finishRun(input: FinishRunInput): Promise<void>;
  failRun(input: FailRunInput): Promise<void>;
  cancelRun(input: { runId: string; workspaceId: string }): Promise<void>;
}

/**
 * Failure types activities raise (as ApplicationFailure types) so the workflow can tell them apart without parsing
 * messages. `BudgetExceeded` carries the gateway's BudgetDetails in its details.
 */
export const FAILURE = {
  budget: 'BudgetExceeded',
  step: 'StepFailed',
} as const;

/** The details an activity attaches to a BudgetExceeded failure. */
export interface BudgetFailureDetails {
  scope: 'workspace' | 'run';
  capUsd: number;
  shortfallUsd: number;
}
