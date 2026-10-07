/**
 * The shape of a demo run script. Each recipe's demo is a list of steps the demo runner walks on a timer:
 * AI and tool steps produce sample artifacts and sample costs; "you" steps open a checkpoint and apply the
 * answer, so what you write ends up in the deliverable.
 */
import type { CheckpointKind, CheckpointOption, CheckpointResolution, Medium, ProblemBrief, RunRecord } from '@byway/contracts';
import type { BlockCode, GlueCode } from '@byway/protocol';
import type { Role } from '@byway/recipe';
import type { Who } from '../../view/vocabulary.ts';
import type { PageCopy, PageStyle } from './samples/pages.ts';

export type StageCode = 'D1' | 'D2' | 'D3';

/** An artifact a step made (already stored), announced as an `artifact` event. */
export interface Produced {
  artifactId: string;
  mediaType: string;
  label?: string;
  shot?: number;
  /** Candidate index for drafts made in parallel. */
  candidate?: number;
}

export interface Ask {
  kind: CheckpointKind;
  prompt: string;
  options?: CheckpointOption[];
  k?: number;
  initialText?: string;
  artifactIds?: string[];
}

/** Everything a script remembers between steps. */
export interface DemoState {
  /** The route chosen at a "choose" checkpoint. */
  entry?: string;
  direction?: string;
  /** Artifact id of the current version of the deliverable. */
  current?: string;
  /** Annotation artifacts shown next to a "Done?" question. */
  notes?: string[];
  done?: boolean;
  // Landing Page Studio
  styles?: PageStyle[];
  copies?: PageCopy[];
  drafts?: string[];
  imagery?: boolean;
  page?: { style: PageStyle; brand: string; copy: PageCopy; trimmed: boolean };
  // Text recipes
  cards?: string[];
  cardIds?: string[];
  chosen?: number[];
  text?: string;
  /** The version before the cliché swaps (A) and after (B), as artifact ids. */
  before?: string;
  after?: string;
  afterText?: string;
  rounds?: number;
  // Ad Video Chain
  voiceover?: string;
  frames?: string[];
  onScreen?: string;
  // Lean Code Review
  diff?: string;
  why?: string;
}

export interface DemoContext {
  readonly run: RunRecord;
  readonly problem: ProblemBrief;
  /** A short phrase naming what the run is about, for sample copy. */
  readonly subject: string;
  readonly routes: Record<string, string>;
  state: DemoState;
  /** Stores text as an artifact and returns its id. */
  put(text: string, mediaType: string): Promise<string>;
  getText(artifactId: string): Promise<string>;
}

export interface ScriptStep {
  /** Recipe node id; also the event stepId. */
  id: string;
  stage: StageCode;
  label: string;
  role: Role;
  who: Who;
  block?: BlockCode;
  glue?: GlueCode;
  /** Sample cost of the whole step in USD (AI steps). */
  costUsd?: number;
  /** Duration in step units. */
  units?: number;
  /** Loop rounds to report as loop-iteration events. */
  iterations?: number;
  /** Runs the step when true; a string skips it and shows the reason; false leaves it out of the timeline. */
  when?: (ctx: DemoContext) => boolean | string;
  work?: (ctx: DemoContext) => Promise<Produced[]>;
  note?: (ctx: DemoContext) => string | undefined;
  ask?: (ctx: DemoContext) => Promise<Ask>;
  apply?: (ctx: DemoContext, res: CheckpointResolution) => Promise<void> | void;
  /** After this step, go back to the step with this id (another round). */
  again?: (ctx: DemoContext) => string | undefined;
}

export interface Script {
  recipeId: string;
  family: string;
  title: string;
  medium: Medium;
  steps: ScriptStep[];
  /** Stores the deliverable and returns its artifact id. */
  finish: (ctx: DemoContext) => Promise<string>;
}
