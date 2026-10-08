import type { RecipePresentation } from '@byway/contracts';
import { BLOCK_NAMES, STAGE_NAMES } from '@byway/catalog';
import { walk, walkNode, type Node, type Pick, type Recipe, type Stage, type Step } from '@byway/recipe';

/**
 * The plain-language presentation of a composed recipe (spec §5 vocabulary). The catalog's presentations are written
 * by hand for the eight configurations and its builder takes only those, so a composed recipe's steps are labelled
 * from block names (`BLOCK_NAMES`) and roles instead, and grouped the way the catalog groups them: a render belongs to
 * the step that reads it, and a writer that applies a critique belongs to the step that made the critique ("Outside
 * critique" is render, critic and fix). Every step, pick and operator id lands in exactly one shown step's `stepIds`,
 * so any run event can be labelled.
 */

type Who = RecipePresentation['stages'][number]['steps'][number]['who'];
type Unit = Step | Pick;

/** The plain label of one step or pick, from its block or role. */
export function stepLabel(n: Unit): string {
  if (n.op === 'pick') {
    if (n.mode === 'H') return n.k === 1 ? 'Pick one' : `Pick ${n.k}`;
    return n.mode === 'C' ? 'AI picks' : 'Random pick';
  }
  if (n.role === 'check') return 'Defect check';
  if (n.role === 'tells-compare') return 'Keep or revert';
  if (n.block === 'VISION' && n.actor !== 'human') return 'Directions to react to';
  if (n.block === 'CUT' && n.actor !== 'human') return 'Trim marks';
  if (n.block) return BLOCK_NAMES[n.block];
  switch (n.role) {
    case 'build':
      return n.actor === 'human' ? 'Your draft' : 'Draft';
    case 'fix':
      return 'Revise';
    case 'dedupe':
      return 'Merge near-duplicates';
    case 'overlap':
      return 'Obvious-answer check';
    case 'judge':
    case 'select':
      return 'AI choice';
    case 'render':
      return 'Render';
    default:
      return n.role.charAt(0).toUpperCase() + n.role.slice(1);
  }
}

/** One plain sentence on what a shown step does, from its lead node; `applies` when it also applies its own findings. */
function explainer(n: Unit, applies: boolean): string {
  if (n.op === 'pick') return n.mode === 'H' ? 'Your turn: choose what to keep.' : 'The AI chooses what to keep.';
  const yours = n.actor === 'human';
  switch (n.block) {
    case 'SEED':
      return 'Separate sessions, each from its own random spark, so the drafts do not settle on the same safe answer.';
    case 'VISION':
      return yours ? 'Your turn: say what you want, what pulls you and what to avoid.' : 'The AI offers directions for you to react to.';
    case 'CRITIC':
      if (n.role === 'check') return 'A look for defects only. It makes no taste calls.';
      return applies
        ? 'A separate reviewer looks at the work as its audience will and names the biggest gaps; the AI fixes them.'
        : 'A separate reviewer looks at the work as its audience will and names the biggest gaps.';
    case 'ASSET':
      return 'The AI makes the images the work needs.';
    case 'RELAY':
      return 'Specialist models make the motion, each part starting where the last one ended.';
    case 'CUT':
      if (yours) return applies ? 'Your turn: list what the work could lose, and the AI removes it.' : 'Your turn: mark what the work could lose.';
      return applies ? 'A fresh reviewer lists what the work could lose, and the AI removes it.' : 'A fresh reviewer marks what could go. Nothing is deleted for you.';
    case 'TELLS':
      if (n.role === 'tells-compare') return 'Your turn: compare the versions before and after the sweep, and keep the better one.';
      return applies ? 'A fresh reviewer flags stock patterns, and the AI swaps them for something specific.' : 'A fresh reviewer flags stock patterns. It flags only.';
    case 'VOICE':
      return 'Your turn: write the words readers will take as yours.';
  }
  switch (n.role) {
    case 'build':
      return yours ? 'Your turn: write or revise the work yourself.' : 'The AI drafts the work.';
    case 'check':
      return applies ? 'A look for defects only, which the AI then fixes.' : 'A look for defects only. It makes no taste calls.';
    case 'dedupe':
      return 'Options that say the same thing are merged, so the field stays wide.';
    case 'overlap':
      return 'Plain sessions with no spark show what anyone would get; options that match them are flagged.';
    case 'fix':
      return 'The AI revises the work.';
    case 'render':
      return 'The work is rendered as its audience will see it.';
    default:
      return yours ? 'Your turn.' : 'The AI does this step.';
  }
}

function whoDoes(units: Unit[]): Who {
  const actors = units.map((u) => u.actor);
  if (actors.includes('human')) return 'you';
  if (actors.includes('model')) return 'ai';
  return 'tool';
}

/** Roles whose output is a critique a following writer applies. */
const FINDS = new Set(['critic', 'check', 'cut', 'tells-sweep']);
const appliesFindings = (u: Unit) => u.op === 'step' && u.writes === true && u.consumes.includes('critique');
const isRender = (u: Unit) => u.op === 'step' && u.role === 'render';
/** The node a group is named after: the first that is not a render. */
const leadOf = (group: Unit[]): Unit => group.find((u) => !isRender(u)) ?? group[0]!;

/**
 * The shown steps of one stage, from its steps and picks in order: renders wait for the next node (the one that reads
 * them), and a writer that applies a critique joins the group that made it, once.
 */
function groupStage(units: Unit[]): Unit[][] {
  const groups: Unit[][] = [];
  let renders: Unit[] = [];
  for (const u of units) {
    if (isRender(u)) {
      renders.push(u);
      continue;
    }
    const last = groups.at(-1);
    const lead = last && leadOf(last);
    if (!renders.length && last && lead?.op === 'step' && FINDS.has(lead.role) && appliesFindings(u) && !last.some(appliesFindings)) {
      last.push(u);
      continue;
    }
    groups.push([...renders, u]);
    renders = [];
  }
  // Renders at the end of a stage belong to the step before them (or stand alone).
  if (renders.length) {
    const last = groups.at(-1);
    if (last) last.push(...renders);
    else groups.push(renders);
  }
  return groups;
}

export interface ComposedCopy {
  name: string;
  promise: string;
  bestFor: string[];
  /** Shown as the code when "Show technical names" is on. */
  code: string;
}

export function presentComposed(recipe: Recipe, copy: ComposedCopy): RecipePresentation {
  const order = new Map<string, number>();
  walk(recipe, (n) => {
    if ('id' in n && n.id !== undefined && !order.has(n.id)) order.set(n.id, order.size);
  });

  // Steps and picks per stage, in walk order; a pick's judge is shown with its pick, not on its own.
  const groups: { stage: Stage['stage']; units: Unit[] }[] = [];
  for (const s of recipe.stages) {
    const units: Unit[] = [];
    const judges = new Set<Step>();
    walkNode(s.body, '', s.stage, (n) => {
      if (n.op === 'pick') {
        units.push(n);
        if (n.judge) judges.add(n.judge);
      } else if (n.op === 'step' && !judges.has(n)) units.push(n);
    });
    for (const g of groupStage(units)) groups.push({ stage: s.stage, units: g });
  }

  /** Index of the shown step each id belongs to. */
  const owner = new Map<string, number>();
  groups.forEach((g, i) => {
    for (const u of g.units) {
      owner.set(u.id, i);
      if (u.op === 'pick' && u.judge) owner.set(u.judge.id, i);
    }
  });
  // Operators go with the shown step that holds their first node: a loop's checkpoints and rounds, an optional's
  // question and a route's choice then read as the step they are about.
  walk(recipe, (n, path, stage) => {
    if (n.op === 'step' || n.op === 'pick' || !('id' in n) || n.id === undefined) return;
    let first: number | undefined;
    walkNode(n, path, stage, (c) => {
      if (first === undefined && (c.op === 'step' || c.op === 'pick')) first = owner.get(c.id);
    });
    if (first !== undefined) owner.set(n.id, first);
  });

  const shown = groups.map(({ stage, units }) => {
    const lead = leadOf(units);
    const applies = units.some((u) => u !== lead && appliesFindings(u));
    return { stage: STAGE_NAMES[stage], label: stepLabel(lead), explainer: explainer(lead, applies), who: whoDoes(units), stepIds: [] as string[] };
  });
  for (const [id, i] of [...owner].sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))) shown[i]!.stepIds.push(id);

  const stages: RecipePresentation['stages'] = [];
  for (const { stage, ...step } of shown) {
    if (stages.at(-1)?.stage !== stage) stages.push({ stage, steps: [] });
    stages.at(-1)!.steps.push(step);
  }
  return { recipeId: recipe.id, code: copy.code, name: copy.name, promise: copy.promise, medium: recipe.medium ?? 'prose', bestFor: copy.bestFor, stages };
}

/** Nodes with ids, for checks that every one is shown. */
export function nodeIds(recipe: Recipe): string[] {
  const ids: string[] = [];
  walk(recipe, (n: Node) => {
    if ('id' in n && n.id !== undefined) ids.push(n.id);
  });
  return ids;
}
