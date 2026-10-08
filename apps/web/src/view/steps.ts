/**
 * Which shown step a run event belongs to. A presentation lists, for each step it shows, the recipe step and pick
 * ids that step stands for (`stepIds`); the runner tags step events with the step's id and operator events (a
 * loop's rounds, an optional's question) with the operator's id. This index answers both, so the timeline can label
 * every event in plain words, whichever runner emitted it.
 */
import type { RecipePresentation } from '@byway/contracts';
import { children, walk, type Node, type Recipe } from '@byway/recipe';
import type { StageName, Who } from './vocabulary.ts';

export interface ShownStep {
  /** Position in the presentation, so two shown steps with the same label (C7's two trims) stay apart. */
  index: number;
  label: string;
  who: Who;
  stage: StageName;
}

/** Recipe node id → the shown step it belongs to. Plain data, so the server can hand it to the Run screen. */
export type StepIndex = Record<string, ShownStep>;

/** The shown step for a node id; own keys only, so an id like "constructor" finds nothing. */
export function shownStep(index: StepIndex | null | undefined, id: string | undefined): ShownStep | undefined {
  return index && id !== undefined && Object.hasOwn(index, id) ? index[id] : undefined;
}

function firstShown(node: Node, index: StepIndex): ShownStep | undefined {
  for (const child of children(node)) {
    const found = (child.op === 'step' || child.op === 'pick' ? shownStep(index, child.id) : undefined) ?? firstShown(child, index);
    if (found) return found;
  }
  return undefined;
}

/**
 * Builds the index from a presentation and, when known, its recipe. With the recipe, each operator (loop, optional,
 * route, gate, relay, replicate, each, audit) maps to the shown step of the first step inside it, which is where a
 * person looks for "round 2" or "Do any drafts look plain?".
 */
export function stepIndex(presentation: RecipePresentation, recipe?: Recipe): StepIndex {
  const entries = new Map<string, ShownStep>();
  let position = 0;
  for (const stage of presentation.stages) {
    for (const step of stage.steps) {
      const shown: ShownStep = { index: position++, label: step.label, who: step.who, stage: stage.stage };
      for (const id of step.stepIds) if (!entries.has(id)) entries.set(id, shown);
    }
  }
  const index: StepIndex = Object.fromEntries(entries);
  if (recipe) {
    walk(recipe, (node) => {
      if (node.op === 'step' || node.op === 'pick' || !node.id || shownStep(index, node.id)) return;
      const first = firstShown(node, index);
      if (first) Object.defineProperty(index, node.id, { value: first, enumerable: true, writable: true, configurable: true });
    });
  }
  return index;
}
