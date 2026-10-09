import type { RecipePresentation } from '@byway/contracts';
import { BLOCK_NAMES, STAGE_NAMES } from '@byway/catalog';
import { asksSwaps, authorWrite, BLOCK_OF_ROLE, blockAgrees, inputsOf, machineWrites, personWrite, voiceScope, voiceWrite, walk, walkNode, type Node, type Pick, type Recipe, type Stage, type Step } from '@byway/recipe';

/**
 * The plain-language presentation of a composed recipe (spec §5 vocabulary). The catalog's presentations are written
 * by hand for the eight configurations and its builder takes only those, so a composed recipe's steps are labelled
 * from block names (`BLOCK_NAMES`) and roles instead, and grouped the way the catalog groups them: a render belongs to
 * the step that reads it, and a writer that applies a critique belongs to the step that made the critique ("Outside
 * critique" is render, critic and fix). Every step, pick and operator id lands in exactly one shown step's `stepIds`,
 * so any run event can be labelled.
 *
 * Labels and explainers read what runs (F08, ADR-0092): a step's block is its role's (a label is a declaration), only
 * a step that writes your words into the work is "your words", worded by what it covers, a random pick says so, and a
 * writer applies a critique by what it is, not by its `writes` flag.
 */

type Who = RecipePresentation['stages'][number]['steps'][number]['who'];
type Unit = Step | Pick;

/** The block a step is by what it runs: its role's, whatever its label says (a check's CRITIC label stays). */
const blockOf = (n: Step) => (blockAgrees(n) ? n.block : BLOCK_OF_ROLE[n.role]);

/** The plain label of one step or pick, from its block or role. */
export function stepLabel(n: Unit): string {
  if (n.op === 'pick') {
    if (n.mode === 'H') return n.k === 1 ? 'Pick one' : `Pick ${n.k}`;
    return n.mode === 'C' ? 'AI picks' : 'Random pick';
  }
  if (n.role === 'check') return 'Defect check';
  if (n.role === 'tells-compare') return 'Keep or revert';
  const block = blockOf(n);
  if (block === 'VISION' && n.actor !== 'human') return 'Directions to react to';
  if (block === 'CUT' && n.actor !== 'human') return 'Trim marks';
  // Your words only where your words are written into the work (a model VOICE step is labelled by its role).
  if (block === 'VOICE' && !voiceWrite(n)) return n.actor === 'human' ? 'Your turn' : 'Revise';
  if (block) return BLOCK_NAMES[block];
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

/**
 * Every sentence a composed step can be explained with, in one place: product copy like the catalog's, so it says what
 * a step does, never what it achieves (CR11, CRED-1), and the web app's claims guard scans this list. The swapping
 * cliché sweep says the person chooses which finds are swapped (convention C2) only where the interpreter asks them
 * (asksSwaps); otherwise the swap step applies every find, and the sentence says so.
 *
 * A sentence that says what other steps do (who wrote the rest, that nothing changes the script later, that nothing is
 * deleted, that you react to the directions) is used only where the recipe's order establishes it (`Around`); the
 * sentence without that claim is used everywhere else.
 */
export const COMPOSED_EXPLAINERS = {
  pickYours: 'Your turn: choose what to keep.',
  pickAi: 'The AI chooses what to keep.',
  pickRandom: 'Chosen at random; no one compares them.',
  seed: 'Separate sessions, each told to take its direction from its own random string.',
  visionYours: 'Your turn: say what you want, what pulls you and what to avoid.',
  visionAi: 'The AI offers directions.',
  visionAiToReact: 'The AI offers directions for you to react to.',
  criticCheck: 'A look for defects only. It makes no taste calls.',
  criticApplies: 'A separate reviewer looks at the work as it will be shown and names the biggest gaps; the AI fixes them.',
  critic: 'A separate reviewer looks at the work as it will be shown and names the biggest gaps.',
  asset: 'The AI makes images for the work.',
  relay: 'Specialist models make the motion, each part starting where the last one ended.',
  cutYoursApplies: 'Your turn: list what the work could lose, and the AI removes it.',
  cutYours: 'Your turn: mark what the work could lose.',
  cutApplies: 'A fresh reviewer lists what the work could lose, and the AI removes it.',
  cut: 'A fresh reviewer marks what could go.',
  cutNothingDeleted: 'A fresh reviewer marks what could go. Nothing is deleted for you.',
  tellsCompare: 'Your turn: compare the version before the swaps with the one after, and keep whichever you prefer.',
  tellsApplies: 'A fresh reviewer lists the stock patterns it finds, each with an alternative; you choose which ones, if any, the AI swaps.',
  tellsAppliesAll: 'A fresh reviewer lists the stock patterns it finds, each with an alternative; the AI swaps every one.',
  tells: 'A fresh reviewer flags stock patterns.',
  tellsFlagsOnly: 'A fresh reviewer flags stock patterns. It flags only.',
  voice: 'Your turn: write the words readers will take as yours.',
  voiceKeyLines: 'Your turn: rewrite the key lines readers act on.',
  voiceKeyLinesAiRest: 'Your turn: rewrite the key lines readers act on; the AI wrote the rest.',
  voiceClaims: 'Your turn: sign off every number, date, name and claim.',
  voiceClaimsAiRest: 'Your turn: sign off every number, date, name and claim; the AI wrote the rest of the words.',
  voiceScript: 'Your turn: write the voice-over script.',
  voiceScriptLocked: 'Your turn: write the voice-over script. It is locked after this.',
  voiceOnScreen: 'Your turn: write the on-screen words: headline, tagline and captions.',
  buildYours: 'Your turn: write or revise the work yourself.',
  build: 'The AI drafts the work.',
  checkApplies: 'A look for defects only, which the AI then fixes.',
  dedupe: 'The AI merges options that say the same thing into one.',
  overlap: 'Plain sessions with no spark show what anyone would get; options that match them are flagged.',
  fix: 'The AI revises the work.',
  render: 'The work is rendered as it will be shown.',
  otherYours: 'Your turn.',
  other: 'The AI does this step.',
} as const;

/** A step in run order: its place in the walk, the loops and relays that run it again, and whether its output is kept. */
interface Ordered {
  step: Step;
  index: number;
  /** The loops and relays around it: each runs its body again (a next round, a next link). */
  repeats: readonly Node[];
  /** In an audit lens, a one-shot gate's body or a pick's judge: what it makes never reaches the work. */
  contained: boolean;
}

function ordered(recipe: Recipe): Ordered[] {
  const out: Ordered[] = [];
  const visit = (n: Node, repeats: readonly Node[], contained: boolean): void => {
    switch (n.op) {
      case 'step':
        out.push({ step: n, index: out.length, repeats, contained });
        return;
      case 'seq':
        n.steps.forEach((c) => visit(c, repeats, contained));
        return;
      case 'loop':
      case 'relay':
        visit(n.body, [...repeats, n], contained);
        return;
      case 'replicate':
      case 'each':
      case 'optional':
        visit(n.body, repeats, contained);
        return;
      case 'route':
        n.branches.forEach((b) => visit(b.body, repeats, contained));
        return;
      case 'audit':
        n.lenses.forEach((l) => visit(l.body, repeats, true));
        return;
      case 'gate':
        visit(n.body, repeats, true);
        return;
      case 'pick':
        if (n.judge) visit(n.judge, repeats, true);
        return;
    }
  };
  for (const s of recipe.stages) visit(s.body, [], false);
  return out;
}

/**
 * Whether `a` can run before `b` on some run: earlier in the walk (run order for a seq; a gate's retry starts its stage
 * again from that stage's entry ports, so nothing made after them carries over), or both in the body of one loop or
 * relay, whose next round or link runs `a` after `b` (a step there comes before itself). Conservative: a step in another
 * branch of a route counts as before, which can only take a claim away.
 */
const canPrecede = (a: Ordered, b: Ordered): boolean => a.index < b.index || a.repeats.some((r) => b.repeats.includes(r));

/** What the recipe's order establishes about the steps around a step, for the sentences that say so. */
interface Around {
  /** A VOICE that no person's write (a VOICE or your own draft) can come before: the AI wrote the rest of the work. */
  aiWroteRest: Set<Step>;
  /**
   * A script VOICE that nothing you write later can change: no draft of your own and no script VOICE after it, itself
   * included in a loop. A later on-screen or claims VOICE cannot touch the voice-over (copy.ts applyOnScreen).
   */
  scriptLocked: Set<Step>;
  /** A model CUT or cliché sweep whose notes no AI writer can take in after it: nothing is deleted or swapped. */
  notesOnly: Set<Step>;
  /** A model VISION that a step of yours that reacts (a person's VISION) can follow. */
  reactedTo: Set<Step>;
}

function around(recipe: Recipe): Around {
  const steps = ordered(recipe);
  const reaching = steps.filter((o) => !o.contained);
  const out: Around = { aiWroteRest: new Set(), scriptLocked: new Set(), notesOnly: new Set(), reactedTo: new Set() };
  // A claim holds for a step only if it holds at every place the step object sits (a built recipe may reuse one).
  const failed = new Map<Set<Step>, Set<Step>>();
  const claim = (set: Set<Step>, s: Step, holds: boolean): void => {
    const no = failed.get(set) ?? failed.set(set, new Set()).get(set)!;
    if (!holds) {
      no.add(s);
      set.delete(s);
    } else if (!no.has(s)) set.add(s);
  };
  for (const o of steps) {
    const s = o.step;
    const before = (f: (t: Step) => boolean) => reaching.some((x) => f(x.step) && canPrecede(x, o));
    const after = (f: (t: Step) => boolean) => reaching.some((y) => f(y.step) && canPrecede(o, y));
    if (voiceWrite(s)) {
      claim(out.aiWroteRest, s, !before(personWrite));
      claim(out.scriptLocked, s, !after((t) => authorWrite(t) || (voiceWrite(t) && voiceScope(t, recipe.medium).base === 'script')));
    }
    if (s.actor === 'model' && (s.role === 'cut' || s.role === 'tells-sweep')) claim(out.notesOnly, s, !after((t) => machineWrites(t) && inputsOf(t).includes('critique')));
    if (s.actor === 'model' && s.role === 'vision') claim(out.reactedTo, s, after((t) => t.actor === 'human' && t.role === 'vision'));
  }
  return out;
}

/** Your words, by what the VOICE covers in this medium, and what the order around it establishes. */
function voiceExplainer(n: Step, medium: Recipe['medium'], near: Around): string {
  const E = COMPOSED_EXPLAINERS;
  const scope = voiceScope(n, medium);
  const aiRest = near.aiWroteRest.has(n);
  if (scope.base === 'claims') return aiRest ? E.voiceClaimsAiRest : E.voiceClaims;
  if (scope.base === 'script') return near.scriptLocked.has(n) ? E.voiceScriptLocked : E.voiceScript;
  if (scope.base === 'on-screen') return E.voiceOnScreen;
  if (!scope.keyLines) return E.voice;
  return aiRest ? E.voiceKeyLinesAiRest : E.voiceKeyLines;
}

/**
 * One plain sentence on what a shown step does, from its lead node; `applies` when it also applies its own findings,
 * `asks` when the person chooses which of a cliché sweep's finds are applied.
 */
function explainer(n: Unit, applies: boolean, asks: boolean, medium: Recipe['medium'], near: Around): string {
  const E = COMPOSED_EXPLAINERS;
  if (n.op === 'pick') return n.mode === 'H' ? E.pickYours : n.mode === 'R' ? E.pickRandom : E.pickAi;
  if (n.actor === 'human') return yoursExplainer(n, applies, medium, near);
  switch (blockOf(n)) {
    case 'SEED':
      return E.seed;
    case 'VISION':
      return near.reactedTo.has(n) ? E.visionAiToReact : E.visionAi;
    case 'CRITIC':
      if (n.role === 'check') return E.criticCheck;
      return applies ? E.criticApplies : E.critic;
    case 'ASSET':
      return E.asset;
    case 'RELAY':
      return E.relay;
    case 'CUT':
      if (applies) return E.cutApplies;
      return near.notesOnly.has(n) ? E.cutNothingDeleted : E.cut;
    case 'TELLS':
      // A machine keep-or-revert is not your turn (PR7.2 refuses one in a composed recipe).
      if (n.role === 'tells-compare') return E.other;
      if (!applies) return near.notesOnly.has(n) ? E.tellsFlagsOnly : E.tells;
      return asks ? E.tellsApplies : E.tellsAppliesAll;
  }
  switch (n.role) {
    case 'build':
      return E.build;
    case 'check':
      return applies ? E.checkApplies : E.criticCheck;
    case 'dedupe':
      return E.dedupe;
    case 'overlap':
      return E.overlap;
    case 'fix':
      return E.fix;
    case 'render':
      return E.render;
    default:
      return E.other;
  }
}

/**
 * A step a person takes: said as their turn, never as the AI's or a reviewer's. A person's fix is their own draft, as a
 * person's build is (authorWrite); a step of theirs with no sentence of its own (an image step, a merge, a sweep) is
 * "Your turn."
 */
function yoursExplainer(n: Step, applies: boolean, medium: Recipe['medium'], near: Around): string {
  const E = COMPOSED_EXPLAINERS;
  switch (blockOf(n)) {
    case 'VISION':
      return E.visionYours;
    case 'CUT':
      return applies ? E.cutYoursApplies : E.cutYours;
    case 'TELLS':
      if (n.role === 'tells-compare') return E.tellsCompare;
      break;
    case 'VOICE':
      if (voiceWrite(n)) return voiceExplainer(n, medium, near);
      break;
  }
  if (n.role === 'check') return applies ? E.checkApplies : E.criticCheck;
  return authorWrite(n) ? E.buildYours : E.otherYours;
}

function whoDoes(units: Unit[]): Who {
  const actors = units.map((u) => u.actor);
  if (actors.includes('human')) return 'you';
  if (actors.includes('model')) return 'ai';
  return 'tool';
}

/** Roles whose output is a critique a following writer applies. */
const FINDS = new Set(['critic', 'check', 'cut', 'tells-sweep']);
/**
 * A machine writer that takes in a critique, consumed or read when it is there (ADR-0089: a read fills the same slot):
 * it applies the findings, by what it runs (not by its `writes` flag).
 */
const appliesFindings = (u: Unit) => u.op === 'step' && machineWrites(u) && inputsOf(u).includes('critique');
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

  // The cliché sweeps that ask you which finds to swap: the interpreter reads the steps after each in its own seq.
  const asking = new Set<Node>();
  walk(recipe, (n) => {
    if (n.op !== 'seq') return;
    n.steps.forEach((c, i) => {
      if (asksSwaps(c, n.steps.slice(i + 1))) asking.add(c);
    });
  });

  const near = around(recipe);
  const shown = groups.map(({ stage, units }) => {
    const lead = leadOf(units);
    const applies = units.some((u) => u !== lead && appliesFindings(u));
    return { stage: STAGE_NAMES[stage], label: stepLabel(lead), explainer: explainer(lead, applies, asking.has(lead), recipe.medium, near), who: whoDoes(units), stepIds: [] as string[] };
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
