import type { RecipePresentation } from '@byway/contracts';
import { BLOCK_NAMES, STAGE_NAMES } from '@byway/catalog';
import {
  appliesCritique,
  asksSwaps,
  audioAsset,
  authorWrite,
  BLOCK_OF_ROLE,
  blockAgrees,
  canPrecede,
  critiqueSources,
  directionsReactedTo,
  followsEveryRun,
  hasNoExecutor,
  lockedScripts,
  machineWrites,
  personWrite,
  promptShows,
  replacesCritique,
  runOrder,
  voiceScope,
  voiceWrite,
  walk,
  walkNode,
  type Node,
  type Pick,
  type Recipe,
  type Stage,
  type Step,
} from '@byway/recipe';

/**
 * The plain-language presentation of a composed recipe (spec §5 vocabulary). The catalog's presentations are written
 * by hand for the eight configurations and its builder takes only those, so a composed recipe's steps are labelled
 * from block names (`BLOCK_NAMES`) and roles instead, and grouped the way the catalog groups them: a render belongs to
 * the step that reads it, and a writer that applies a critique belongs to the step whose critique it applies on every
 * path, every time that step runs (@byway/recipe critiqueSources and followsEveryRun; "Outside critique" is render,
 * critic and fix). Every step, pick and operator id
 * lands in exactly one shown step's `stepIds`, so any run event can be labelled.
 *
 * Labels and explainers read what runs (F08, ADR-0092): a step's block is its role's (a label is a declaration), only
 * a step that writes your words into the work is "your words", worded by what it covers, a random pick says so, a
 * writer applies a critique by what it is, not by its `writes` flag, and a step with no executor yet says it is
 * skipped (ADR-0069).
 */

type Who = RecipePresentation['stages'][number]['steps'][number]['who'];
type Unit = Step | Pick;

/** The block a step is by what it runs: its role's, whatever its label says (a check's CRITIC label stays). */
const blockOf = (n: Step) => (blockAgrees(n) ? n.block : BLOCK_OF_ROLE[n.role]);

/**
 * The plain label of one step or pick, from its block or role. A label that says something about the steps around it
 * ("Directions to react to") is used only where the recipe establishes it (`near`: the recipe's `Around`); without
 * that context the label claims nothing about them. Labels only name steps: the diff never compares them, so a
 * label that differs between two recipes is never by itself a change.
 */
export function stepLabel(n: Unit, near?: Pick_<Around, 'reactedTo'>): string {
  if (n.op === 'pick') {
    if (n.mode === 'H') return n.k === 1 ? 'Pick one' : `Pick ${n.k}`;
    return n.mode === 'C' ? 'AI picks' : 'Random pick';
  }
  if (n.role === 'check') return 'Defect check';
  if (n.role === 'tells-compare') return 'Keep or revert';
  // An ASSET that makes voice-over audio makes no imagery, and a tool RELAY composites (the catalog's C5 names them so).
  if (n.actor !== 'human' && audioAsset(n)) return 'Voice-over audio';
  if (n.actor === 'tool' && n.role === 'relay') return 'Composite';
  const block = blockOf(n);
  if (block === 'VISION' && n.actor !== 'human') return near?.reactedTo.has(n) ? 'Directions to react to' : 'Directions';
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
 * a step does, never what it achieves (CR11, CRED-1), and the web app's claims guard scans this list. A cliché sweep
 * says the person chooses which finds are swapped (convention C2) exactly where the interpreter asks them (asksSwaps,
 * at every place the sweep sits); that the AI swaps every one where a writer in its stage applies its finds, every time
 * it runs, and no one is asked; and neither anywhere else.
 *
 * A sentence that says what other steps do (who wrote the rest, that nothing changes the script later, that nothing is
 * deleted, that you react to the directions) is used only where the recipe establishes it (`Around`): by its order,
 * or, for the directions, by what reaches your next VISION. The sentence without that claim is used everywhere else.
 * So is a sentence about how a step runs where it sits: separate sessions only for a seed that fans out, a chain of
 * clips only inside a relay chain. A step's findings are said to be applied only by a writer that applies them and no
 * other critique, and that every run of the step reaches: not from a loop round or relay link that runs the step again
 * before the writer has taken the last run's findings in.
 *
 * A step is described by what this version runs (ADR-0069): one with no executor yet (@byway/recipe hasNoExecutor: a
 * tool relay's compositing, voice-over audio, any other tool or policy step that is not a render) finishes skipped and
 * passes the work through, and its sentence says so. A machine writer inside an audit lens or a final check's body
 * drafts a version that never reaches the work (the plain sessions of an obvious-answer check), and never applies a
 * critique to it.
 */
export const COMPOSED_EXPLAINERS = {
  pickYours: 'Your turn: choose what to keep.',
  pickAi: 'The AI chooses what to keep.',
  pickRandom: 'Chosen at random; no one compares them.',
  seed: 'Separate sessions, each told to take its direction from its own random string.',
  seedOne: 'One session, told to take its direction from its own random string.',
  visionYours: 'Your turn: say what you want, what pulls you and what to avoid.',
  visionAi: 'The AI offers directions.',
  visionAiToReact: 'The AI offers directions for you to react to.',
  criticCheck: 'A look for defects only. It makes no taste calls.',
  criticApplies: 'A separate reviewer looks at the work as it will be shown and names the biggest gaps; the AI fixes them.',
  critic: 'A separate reviewer looks at the work as it will be shown and names the biggest gaps.',
  asset: 'The AI makes images for the work.',
  relay: 'Specialist models make the motion, each part starting where the last one ended.',
  relayOne: 'Specialist models make one clip of the last shot, starting from the latest start frame: where the last clip ended, or the first shot’s frame.',
  compositingSkipped: 'Not available in this version: compositing is skipped, and the work passes through unchanged.',
  audioSkipped: 'Not available in this version: no voice-over audio is made, and the work passes through unchanged.',
  skipped: 'Not available in this version: this step is skipped, and the work passes through unchanged.',
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
  aside: 'The AI drafts a version that never becomes the work: only the check it sits in reads it.',
  checkApplies: 'A look for defects only, which the AI then fixes.',
  dedupe: 'The AI merges options that say the same thing into one.',
  overlap: 'Plain sessions with no spark show what anyone would get; options that match them are flagged.',
  fix: 'The AI revises the work.',
  render: 'The work is rendered as it will be shown.',
  otherYours: 'Your turn.',
  other: 'The AI does this step.',
} as const;

/** What the recipe establishes about the steps around a step, for the sentences that say so. */
interface Around {
  /** The recipe's medium: which template a step's prompt renders, and so what it shows (ADR-0097). */
  medium: Recipe['medium'];
  /** A VOICE that no person's write (a VOICE or your own draft) can come before: the AI wrote the rest of the work. */
  aiWroteRest: Set<Step>;
  /**
   * A script VOICE that nothing you write later can change (@byway/recipe lockedScripts): no draft of your own, no
   * script or claims VOICE after it, and no loop round, relay link or final check's re-run that asks for it again. The
   * on-screen VOICE cannot touch the voice-over (copy.ts applyOnScreen).
   */
  scriptLocked: Set<Step>;
  /** A model CUT or cliché sweep whose notes no AI writer can take in after it: nothing is deleted or swapped. */
  notesOnly: Set<Step>;
  /**
   * A model VISION whose directions your next VISION is shown, on every path (@byway/recipe directionsReactedTo): by
   * what reaches that step, since a VISION of yours that merely follows may be shown another step's notes instead.
   */
  reactedTo: Set<Step>;
  /** A seed that runs in separate sessions, one per candidate (inside each, or a replicate of more than one). */
  fanOut: Set<Step>;
  /** A model RELAY inside a relay chain: one clip per shot, each link from where the last one ended. */
  inChain: Set<Step>;
  /** In an audit lens, a final check's body or a pick's judge at every place it sits: what it makes never reaches the work. */
  aside: Set<Step>;
  /** In one of those at some place: a writer there cannot be said to apply a critique to the work. */
  containedSomewhere: Set<Step>;
  /**
   * Whether a writer comes after every run of a step, at every place the step sits (@byway/recipe followsEveryRun): no
   * loop round or relay link runs the step again before the writer has taken its findings in.
   */
  everyRun(step: Step, writer: Step): boolean;
}

/** TypeScript's `Pick`, which the recipe's `Pick` node type shadows here. */
type Pick_<T, K extends keyof T> = { [P in K]: T[P] };

function around(recipe: Recipe): Around {
  const steps = runOrder(recipe).steps;
  const reaching = steps.filter((o) => !o.contained);
  // A script is locked by the shared rule the run itself asks by (lockedScripts): the explainer and the run agree.
  // So are the directions you react to (directionsReactedTo), read from what reaches your next VISION.
  const placesOf = (s: Step) => steps.filter((o) => o.step === s);
  const out: Around = {
    medium: recipe.medium,
    aiWroteRest: new Set(),
    scriptLocked: lockedScripts(recipe),
    notesOnly: new Set(),
    reactedTo: directionsReactedTo(recipe),
    fanOut: new Set(),
    inChain: new Set(),
    aside: new Set(),
    containedSomewhere: new Set(),
    everyRun: (s, writer) => placesOf(s).every((a) => placesOf(writer).some((b) => followsEveryRun(a, b))),
  };
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
    claim(out.aside, s, o.contained);
    if (o.contained) out.containedSomewhere.add(s);
    if (voiceWrite(s)) claim(out.aiWroteRest, s, !before(personWrite));
    if (s.role === 'seed') claim(out.fanOut, s, o.fanOut);
    if (s.role === 'relay') claim(out.inChain, s, o.inRelay);
    // A writer takes the notes in where its prompt shows them (ADR-0097), as appliesFindings and admission read it.
    if (s.actor === 'model' && (s.role === 'cut' || s.role === 'tells-sweep')) claim(out.notesOnly, s, !after((t) => machineWrites(t) && promptShows(t, 'critique', recipe.medium)));
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

/** Where the run asks the person which of a cliché sweep's finds to swap: at every place the sweep sits, at some, or at none. */
type Asks = 'every' | 'some' | 'none';

/**
 * One plain sentence on what a shown step does, from its lead node; `applies` when a writer shown with it applies its
 * findings, `asks` where the person chooses which of a cliché sweep's finds are applied.
 */
function explainer(n: Unit, applies: boolean, asks: Asks, medium: Recipe['medium'], near: Around): string {
  const E = COMPOSED_EXPLAINERS;
  if (n.op === 'pick') return n.mode === 'H' ? E.pickYours : n.mode === 'R' ? E.pickRandom : E.pickAi;
  if (n.actor === 'human') return yoursExplainer(n, applies, medium, near);
  if (hasNoExecutor(n)) return audioAsset(n) ? E.audioSkipped : n.role === 'relay' ? E.compositingSkipped : E.skipped;
  if (near.aside.has(n) && machineWrites(n)) return E.aside;
  switch (blockOf(n)) {
    case 'SEED':
      return near.fanOut.has(n) ? E.seed : E.seedOne;
    case 'VISION':
      return near.reactedTo.has(n) ? E.visionAiToReact : E.visionAi;
    case 'CRITIC':
      if (n.role === 'check') return E.criticCheck;
      return applies ? E.criticApplies : E.critic;
    case 'ASSET':
      return E.asset;
    case 'RELAY':
      return near.inChain.has(n) ? E.relay : E.relayOne;
    case 'CUT':
      if (applies) return E.cutApplies;
      return near.notesOnly.has(n) ? E.cutNothingDeleted : E.cut;
    case 'TELLS':
      // A machine keep-or-revert is not your turn (PR7.2 refuses one in a composed recipe).
      if (n.role === 'tells-compare') return E.other;
      // Asked: the swap step after it applies the finds you chose. "Every one" only where no one is ever asked.
      if (asks === 'every') return E.tellsApplies;
      if (!applies || asks === 'some') return near.notesOnly.has(n) ? E.tellsFlagsOnly : E.tells;
      return E.tellsAppliesAll;
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

/** Roles whose output is a critique a following writer applies, when the step makes one (a tool's is skipped: replacesCritique). */
const FINDS = new Set(['critic', 'check', 'cut', 'tells-sweep']);
/**
 * A writer that applies the findings it takes in (@byway/recipe appliesCritique, the one admission reads): a machine
 * writer by what it runs (not by its `writes` flag) that takes in a critique, consumed or read when it is there
 * (ADR-0089), whose prompt shows it (ADR-0097: a draft or image prompt that renders no critique applies none), and runs
 * in this version, unless what it writes never reaches the work at some place it sits (inside an audit lens or a final
 * check's body).
 */
const appliesFindings = (u: Unit, near: Around) => u.op === 'step' && appliesCritique(u, near.containedSomewhere.has(u), near.medium);
const isRender = (u: Unit) => u.op === 'step' && u.role === 'render';
/** The node a group is named after: the first that is not a render. */
const leadOf = (group: Unit[]): Unit => group.find((u) => !isRender(u)) ?? group[0]!;

/**
 * The shown steps of one stage, from its steps and picks in order: renders wait for the next node (the one that reads
 * them), and a writer that applies a critique joins the group of the step whose critique it applies on every path
 * (`from`: @byway/recipe critiqueSources), with the renders before it, where it comes after every run of that step
 * (`near.everyRun`). Not the group before it: a writer that comes next may apply another step's critique (one that a
 * replicate hands on, say), and one a render or a step of yours sits before may still apply this one's. Nor where a
 * loop round or a relay link runs the step again first: the writer applies only the last run's findings, and stands on
 * its own.
 *
 * A second writer that applies the same findings joins the same group (a fix between a trim and the step that carries
 * out its removals): the group's sentence is true of each. Where the step sits at more than one place, a writer joins
 * the latest group that step leads, whose run's findings are the latest when the writer runs.
 */
function groupStage(units: Unit[], near: Around, from: ReadonlyMap<Step, Step>): Unit[][] {
  const groups: Unit[][] = [];
  let renders: Unit[] = [];
  for (const u of units) {
    if (isRender(u)) {
      renders.push(u);
      continue;
    }
    const writer = u.op === 'step' && appliesFindings(u, near) ? u : undefined;
    const source = writer ? from.get(writer) : undefined;
    const into =
      writer && source && FINDS.has(source.role) && replacesCritique(source) && near.everyRun(source, writer)
        ? groups.findLast((g) => leadOf(g) === source)
        : undefined;
    if (into) into.push(...renders, u);
    else groups.push([...renders, u]);
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
  const near = around(recipe);
  const from = critiqueSources(recipe);
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
    for (const g of groupStage(units, near, from)) groups.push({ stage: s.stage, units: g });
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

  // The cliché sweeps that ask you which finds to swap: the interpreter reads the steps after each in its own seq. A
  // step object may sit in more than one place, and asks at every one, some or none of them.
  const places = new Map<Node, number>();
  const asked = new Map<Node, number>();
  walk(recipe, (n) => {
    if (n.op === 'step') places.set(n, (places.get(n) ?? 0) + 1);
    if (n.op !== 'seq') return;
    n.steps.forEach((c, i) => {
      if (asksSwaps(c, n.steps.slice(i + 1))) asked.set(c, (asked.get(c) ?? 0) + 1);
    });
  });
  const asking = (n: Node): Asks => {
    const k = asked.get(n) ?? 0;
    return k === 0 ? 'none' : k === places.get(n) ? 'every' : 'some';
  };

  const shown = groups.map(({ stage, units }) => {
    const lead = leadOf(units);
    const applies = units.some((u) => u !== lead && appliesFindings(u, near));
    return { stage: STAGE_NAMES[stage], label: stepLabel(lead, near), explainer: explainer(lead, applies, asking(lead), recipe.medium, near), who: whoDoes(units), stepIds: [] as string[] };
  });
  for (const [id, i] of [...owner].sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))) shown[i]!.stepIds.push(id);

  const stages: RecipePresentation['stages'] = [];
  for (const { stage, ...step } of shown) {
    if (stages.at(-1)?.stage !== stage) stages.push({ stage, steps: [] });
    stages.at(-1)!.steps.push(step);
  }
  return { recipeId: recipe.id, code: copy.code, name: copy.name, promise: copy.promise, medium: recipe.medium ?? 'prose', bestFor: copy.bestFor, stages };
}

/**
 * The plain label of each step or pick of a recipe where it sits (stepLabel with the recipe's `Around`), for naming a
 * recipe's steps elsewhere (the diff) as its presentation names them.
 */
export function labelsIn(recipe: Recipe): (n: Unit) => string {
  const near = around(recipe);
  return (n) => stepLabel(n, near);
}

/** Nodes with ids, for checks that every one is shown. */
export function nodeIds(recipe: Recipe): string[] {
  const ids: string[] = [];
  walk(recipe, (n: Node) => {
    if ('id' in n && n.id !== undefined) ids.push(n.id);
  });
  return ids;
}
