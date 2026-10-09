/**
 * What a `byway.recipe/1` recipe does when it runs, written down once (ADR-0092).
 *
 * The runner's interpreter is the truth, and this module mirrors it. It decides:
 * - who changes the work, from a step's actor, role and the ports it produces (never from `writes`);
 * - whose words go into the work, from actor, role and `produces: ['artifact']` (never from the 'voice' port);
 * - what a VOICE covers, from `variant`, the knobs and the run's medium;
 * - which protocol block a step is, from its role (the runner reads `block` only for labels);
 * - whether a step's output is kept, from the operator it sits in;
 * - where a loop's gate can end the loop's body, from the operators between the loop and its critic or check;
 * - which steps have no executor yet and finish skipped, and which can put another critique in place of the last;
 * - what can run after a step, from walk order, the loops and relays around it and the final checks that re-run a
 *   stage: a script VOICE is locked after it only where nothing the person writes later can change it;
 * - where a run's paths go (the one flow walk, `flowRecipe`, that every path rule reads), and what reaches a step along
 *   them: whose critique a writer applies, which of a person's lists and critiques no writer applies, and whose
 *   directions the person's next VISION is shown.
 *
 * Admission (the validator, the composed profile, web start) reads these facts from here. A step's own declarations
 * (`writes`, `produces: ['voice']`, `block`, `keepsVoice`) may only add arming or refusals, never grant a protection,
 * and ST12 refuses a declaration that says less than execution does (and, for VOICE and block labels, one that says
 * anything else).
 *
 * Pure: type-only imports and no Node built-ins, so workflow code can import it through `@byway/recipe/semantics`.
 */
import type { BlockCode, Medium } from '@byway/protocol';
import type { Actor, Audit, Each, Gate, Loop, Node, OneShotGate, Optional, PassCondition, Pick as PickNode, Recipe, RelayChain, Replicate, Role, Route, Seq, Stage, Step } from './schema.ts';

/** The facts about a step that decide what it does to the work. */
export type StepFacts = Pick<Step, 'actor' | 'role' | 'produces'>;

// ---- Effects ----------------------------------------------------------------------------------------------------

/**
 * What a step does to the work when it runs (the interpreter's dispatch, spec §3.2):
 * - `writes`: it puts a new version in place of the work;
 * - `restores`: it can put the version from before the latest write back (a keep-or-revert);
 * - `annotates`: it adds notes, a score, a choice, a brief, a direction or images beside the work, which stays as it was;
 * - `renders`: it renders the work into a view;
 * - `passes`: it has no executor in byway yet and finishes as an honest skip (ADR-0069).
 */
export type StepEffect = 'writes' | 'restores' | 'annotates' | 'renders' | 'passes';

/**
 * Human roles whose checkpoint is a `write` (the runner's wording.ts `humanKind`): VOICE, and the author's own draft in
 * C3, C6 and C6a. A human build and a human fix run identically (the same human.ts branch and the same question).
 */
export const HUMAN_WRITE_ROLES: ReadonlySet<Role> = new Set<Role>(['voice', 'build', 'fix']);

/**
 * Model roles whose answer is parsed as a note, a score, a label or a list and never as the work (the runner's
 * `parserFor`, and the critic's own branch of `modelStep`). Every other model role writes the work: the parser's
 * default branch takes any role it does not know as a writer, so this table fails closed in the same direction.
 */
export const MODEL_NOTE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'check', 'cut', 'tells-sweep', 'vision', 'judge', 'select', 'dedupe', 'overlap']);

/**
 * A person writes their own text into the work: a human VOICE, build or fix that produces the artifact (human.ts
 * `finishHumanStep`: a `write` checkpoint whose step produces `artifact` stores the person's text as the work).
 */
export const personWrite = (s: StepFacts): boolean => s.actor === 'human' && HUMAN_WRITE_ROLES.has(s.role) && s.produces.includes('artifact');

/** The person's words go into the work as the reader-facing copy (a VOICE write-back): the protection VOICE gives. */
export const voiceWrite = (s: StepFacts): boolean => personWrite(s) && s.role === 'voice';

/**
 * The author writes the work themselves (C3 "your own draft", C6, C6a). Any person write that is not VOICE: a human
 * build and a human fix execute the same way, so the role label must not decide the protection.
 */
export const authorWrite = (s: StepFacts): boolean => personWrite(s) && s.role !== 'voice';

/** What a step does to the work when it runs. */
export function stepEffect(s: StepFacts): StepEffect {
  switch (s.actor) {
    case 'tool':
      return s.role === 'render' ? 'renders' : 'passes';
    case 'policy':
      return 'passes';
    case 'human':
      if (personWrite(s)) return 'writes';
      return s.role === 'tells-compare' ? 'restores' : 'annotates';
    case 'model':
      if (s.role === 'tells-compare') return 'restores';
      // An ASSET step places its images in the work only when it produces the artifact (asset.ts); otherwise they are
      // kept beside it.
      if (s.role === 'asset') return s.produces.includes('artifact') ? 'writes' : 'annotates';
      return MODEL_NOTE_ROLES.has(s.role) ? 'annotates' : 'writes';
  }
}

/** A machine step (model, tool or policy) that puts a new version in place of the work when it runs. */
export const machineWrites = (s: StepFacts): boolean => s.actor !== 'human' && stepEffect(s) === 'writes';

/**
 * Whether a machine step can change the work where it sits. Inside a container (an audit lens, a one-shot gate's
 * body, a pick's judge) its output is dropped, so a contained writer changes nothing. A declared `writes: true` always
 * counts: a declaration may add a refusal, never take one away (C5's matte, a tool relay that runs as a skip, is
 * declared a writer and is held to that).
 */
export const changesWork = (s: StepFacts & Pick<Step, 'writes'>, contained: boolean): boolean => (!contained && machineWrites(s)) || s.writes === true;

/** A keep-or-revert: it can put the version from before the latest write back in place of the work. */
export const restoresWork = (s: StepFacts): boolean => stepEffect(s) === 'restores';

/**
 * A machine write that always leaves the version it replaced as the previous one, so a keep-or-revert after it can
 * bring back no older version. ASSET and RELAY steps are left out: they can finish as an honest skip (no image or video
 * model), which leaves the previous version as it was.
 */
export const refreshesPrevious = (s: StepFacts): boolean => s.actor === 'model' && stepEffect(s) === 'writes' && s.role !== 'asset' && s.role !== 'relay';

/** An ASSET that turns the script into voice-over audio rather than images (03 C5 "VO audio from the locked script"): one that consumes the voice port (asset.ts). */
export const audioAsset = (s: Pick<Step, 'role' | 'consumes'>): boolean => s.role === 'asset' && s.consumes.includes('voice');

/**
 * A step with no executor in byway yet: whatever the run is set up with, it finishes skipped with a plain note and
 * the work passes through unchanged (ADR-0069). Every step that `passes` (a policy step, and a tool step other than a
 * render: a tool RELAY is compositing), and a model audio ASSET: no provider makes voice-over audio in v1 (asset.ts).
 * An audio ASSET keeps its effect (a writer when it produces the artifact): admission holds it to what it will do once
 * it has an executor, which can only add a refusal.
 */
export const hasNoExecutor = (s: StepFacts & Pick<Step, 'consumes'>): boolean => stepEffect(s) === 'passes' || (s.actor === 'model' && audioAsset(s));

/** Model roles whose answer the interpreter keeps as the new critique (applyModel: a note that is text, not a label, a choice or a keep). */
const CRITIQUE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'check', 'cut', 'tells-sweep', 'overlap']);

/**
 * Model roles whose step leaves a note beside the work when it runs: the runner stores a judging answer as a note
 * (model-step.ts NOTE_LABELS: a critique, defects, removals, cliché hits, overlap flags, a direction), and a seed's
 * build the direction it took. The interpreter puts that note in `ports.notes` in place of the notes before it
 * (applyModel), and a person's question shows the latest notes beside the work (beside()).
 */
export const NOTE_ROLES: ReadonlySet<Role> = new Set<Role>(['critic', 'check', 'cut', 'tells-sweep', 'overlap', 'vision', 'seed']);

/** A model step that leaves its own note in place of the notes before it when it runs. */
export const leavesNote = (s: StepFacts): boolean => s.actor === 'model' && NOTE_ROLES.has(s.role);

/**
 * Whether running a node can put another critique in place of the one before it (the interpreter's applyModel,
 * human(), audit() and gate()): a model critic, check, CUT, cliché sweep or overlap flag, a model or person's VISION
 * that produces a critique, a person's CUT directive or other reaction that produces one, an audit whose lenses do, and
 * a final check whose body does. replicate, each and a pick hand on the ports they started with, so what runs inside
 * them never does; a write (a person's or a machine's) leaves the critique as it was.
 */
export function replacesCritique(n: Node): boolean {
  switch (n.op) {
    case 'step':
      if (n.actor === 'model') return CRITIQUE_ROLES.has(n.role) || (n.role === 'vision' && n.produces.includes('critique'));
      if (n.actor !== 'human' || HUMAN_WRITE_ROLES.has(n.role) || n.role === 'tells-compare') return false;
      return n.role === 'cut' || n.produces.includes('critique');
    case 'seq':
      return n.steps.some(replacesCritique);
    case 'route':
      return n.branches.some((b) => replacesCritique(b.body));
    case 'audit':
      return n.lenses.some((l) => replacesCritique(l.body));
    case 'loop':
    case 'optional':
    case 'relay':
    case 'gate':
      return replacesCritique(n.body);
    case 'replicate':
    case 'each':
    case 'pick':
      return false;
  }
}

/**
 * A person's answer kept as the critique (human()): their CUT's list of what to remove, or a reaction of theirs that
 * produces a critique. The step after it acts on it, so it may sit only where the run hands it on: not in replicate or
 * each (a candidate hands on only its work), an audit lens or a one-shot gate's body (an empty answer is dropped there,
 * and the fix after it applies an earlier critique), and only where some writer applies it on some path
 * (`unappliedCritiques`). Admission refuses it elsewhere (ST12 'critique-per-candidate' and 'critique-unapplied', ST9
 * and ST10 'human-critique'; ADR-0098).
 */
export const personCritique = (s: Step): boolean => s.actor === 'human' && replacesCritique(s);

// ---- Declarations about the person's words ----------------------------------------------------------------------

/** A step that declares itself VOICE: the VOICE block label or the 'voice' port. A declaration, never a protection. */
export const declaresVoice = (s: Pick<Step, 'block' | 'produces'>): boolean => s.block === 'VOICE' || s.produces.includes('voice');

/** What arms the voice lock at admission: an executed VOICE write, or a step that declares one (declarations only add). */
export const voiceArm = (s: StepFacts & Pick<Step, 'block'>): boolean => voiceWrite(s) || declaresVoice(s);

/**
 * What part of the reader-facing copy a VOICE write covers (human.ts and copy.ts):
 * - `claims`: the claim log (variant claim-log): only the numbers, dates, names and causal claims;
 * - `script`: on a storyboard, the script locked early (variant VOICE-early);
 * - `on-screen`: on a storyboard, the headline, tagline and captions (the late VOICE);
 * - `all`: everything else: every reader-facing line.
 * `keyLines` is VOICE-lite (knob scope key-lines): the person rewrites only the key lines of that copy.
 */
export interface VoiceScope {
  base: 'claims' | 'script' | 'on-screen' | 'all';
  keyLines: boolean;
}

export function voiceScope(s: Pick<Step, 'variant' | 'knobs'>, medium: Medium | undefined): VoiceScope {
  const base: VoiceScope['base'] = s.variant === 'claim-log' ? 'claims' : medium === 'media' ? (s.variant === 'VOICE-early' ? 'script' : 'on-screen') : 'all';
  return { base, keyLines: s.knobs?.scope === 'key-lines' };
}

/** A VOICE of the same copy covers another when it is at least as wide: every line covers key lines, never the reverse. */
export const covers = (have: VoiceScope, want: VoiceScope): boolean => have.base === want.base && (!have.keyLines || want.keyLines);

// ---- Blocks -----------------------------------------------------------------------------------------------------

/**
 * The protocol block each role instantiates. The runner never reads `block` except for labels, so a block label is a
 * declaration of its role's block, and it must agree (ST12 block-role). A defect check may carry CRITIC (03 C1's
 * CRITIC-check) or nothing; every other role carries none.
 */
export const BLOCK_OF_ROLE: Readonly<Partial<Record<Role, BlockCode>>> = {
  seed: 'SEED',
  vision: 'VISION',
  critic: 'CRITIC',
  asset: 'ASSET',
  relay: 'RELAY',
  cut: 'CUT',
  'tells-sweep': 'TELLS',
  'tells-compare': 'TELLS',
  voice: 'VOICE',
};

/** Whether a step's block label agrees with its role. */
export const blockAgrees = (s: Pick<Step, 'role' | 'block'>): boolean => (s.role === 'check' ? s.block === undefined || s.block === 'CRITIC' : s.block === BLOCK_OF_ROLE[s.role]);

// ---- Operators --------------------------------------------------------------------------------------------------

/**
 * Who makes a pick's choice, by its mode: H asks a person, C calls the judge step, R draws at random. The declared
 * `actor` must say the same (ST12 pick-actor).
 */
export const PICK_ACTOR: Readonly<Record<PickNode['mode'], Actor>> = { H: 'human', C: 'model', R: 'policy' };

/**
 * The roles a C pick's judge may have. The interpreter runs the judge as a model call and reads its answer as a label
 * (parserFor judge/select); a judge of any other role or actor would be run as something it does not say it is.
 */
export const PICK_JUDGE_ROLES: ReadonlySet<Role> = new Set<Role>(['judge', 'select']);

/**
 * Whether a TELLS sweep's finds go to the person first, who chooses which are swapped (TELLS-1, convention C2; the
 * interpreter's seq calls this after each step). It reads only the nodes after the sweep in its own seq: the next step
 * there that consumes a critique is a model fix, nothing before that fix can put another critique in place of the
 * finds (replacesCritique: the fix would apply that one, and the person's choice would decide nothing), and no
 * keep-or-revert there is a machine's. A step that only reads a critique when there is one (`reads`, ADR-0089) is not
 * that step: no one is asked, and it takes in every find. A headless arm (C1-H, its keep-or-revert by a proxy) and a
 * sweep that only flags (C6, C6a) are left as they are, and so is a sweep whose swap step sits in a seq of its own: the
 * same steps nested differently run differently, so the semantic projection keeps a seq's nesting (projection.ts).
 */
export function asksSwaps(sweep: Node, rest: readonly Node[]): boolean {
  if (sweep.op !== 'step' || sweep.actor !== 'model' || sweep.role !== 'tells-sweep') return false;
  const steps = rest.filter((n): n is Step => n.op === 'step');
  const fix = steps.find((s) => s.consumes.includes('critique'));
  if (fix?.role !== 'fix' || fix.actor !== 'model') return false;
  if (rest.slice(0, rest.indexOf(fix)).some(replacesCritique)) return false;
  return !steps.some((s) => s.role === 'tells-compare' && s.actor !== 'human');
}

/**
 * Operators that hand an enclosing loop's context on to their body, so a critic or check inside reports to that loop's
 * gate: seq, relay, route and optional. replicate, each, audit and a one-shot gate start a fresh context, and an inner
 * loop starts its own (interpreter.ts: they run their bodies without `ctx.loop`).
 */
export const PASSES_LOOP_CONTEXT: ReadonlySet<Node['op']> = new Set<Node['op']>(['seq', 'relay', 'route', 'optional']);

/**
 * Loop metrics whose way out (a plateau, a stopped probe, the cap) can put an earlier scored version back in place of
 * the work: the best snapshot. A person's write inside such a loop could be undone by it (ST12 set-aside).
 */
export const SNAPSHOT_METRICS: ReadonlySet<string> = new Set(['critic-score', 'critic-rank']);

/**
 * A step that reports to a loop's gate: a model critic under a critic-score or critic-rank gate, a model check under a
 * check-clean gate (interpreter.ts: the gate is applied right after such a step finishes). A person's loop (`human`)
 * has none: it is asked only at the end of a round.
 */
export const feedsGate = (s: Pick<Step, 'actor' | 'role'>, metric: string): boolean =>
  s.actor === 'model' && ((s.role === 'critic' && SNAPSHOT_METRICS.has(metric)) || (s.role === 'check' && metric === 'check-clean'));

/**
 * The loop's exit points: the steps right after which its gate may end the body (a passed threshold, a clean check, a
 * plateau, a stopped probe, the cap), so the rest of that round, later relay links included, may not run. They are the
 * steps that report to the gate, reached from the body through operators that pass the loop context on.
 */
export function exitPoints(loop: Loop): Step[] {
  const out: Step[] = [];
  const visit = (n: Node): void => {
    if (n.op === 'step') {
      if (feedsGate(n, loop.gate.metric)) out.push(n);
      return;
    }
    if (!PASSES_LOOP_CONTEXT.has(n.op)) return;
    if (n.op === 'seq') n.steps.forEach(visit);
    else if (n.op === 'route') n.branches.forEach((b) => visit(b.body));
    else if (n.op === 'relay' || n.op === 'optional') visit(n.body);
  };
  visit(loop.body);
  return out;
}

/**
 * What a gate's verdict is read from on every run of its body (ADR-0092 stage 4): the steps that report to it and
 * run whenever the body does. For a loop, its exit points; for a one-shot gate, the model critics whose score it reads
 * (interpreter: the gate reads its body's `score`). Reached the same way: through seq, relay (a storyboard has at least
 * one shot) and every branch of a route, never through an optional (it may not run) or through replicate, each, an
 * audit, a gate or an inner loop (they run without the gate's context, or keep only notes).
 *
 * `always` false: some run of the body gives the gate no verdict, so a loop reaches its cap without one and a one-shot
 * gate reads no score of its own (a stale one, or none). Admission refuses that (ST2 and ST10 'feed').
 */
export function gateFeed(gate: Loop | OneShotGate): { always: boolean; steps: Step[] } {
  const feeds = (s: Step): boolean => (gate.op === 'loop' ? feedsGate(s, gate.gate.metric) : s.actor === 'model' && s.role === 'critic');
  const steps: Step[] = [];
  const visit = (n: Node): boolean => {
    switch (n.op) {
      case 'step':
        if (!feeds(n)) return false;
        steps.push(n);
        return true;
      case 'seq':
        return n.steps.map(visit).some(Boolean);
      case 'relay':
        return visit(n.body);
      case 'route':
        return n.branches.map((b) => visit(b.body)).every(Boolean);
      case 'optional':
        visit(n.body);
        return false;
      default:
        return false;
    }
  };
  const always = visit(gate.body);
  return { always, steps };
}

/**
 * Whether a loop leaves only through its exit points, never from the end of a round: no person holds it, and a step
 * that reports to its gate runs on every round (`gateFeed` always). Its gate then decides right after that step every
 * round (the interpreter's afterGateStep): a passed bar, a clean check, a plateau, a stopped probe, or the cap, where a
 * person may raise it and the round goes on to its end and to the next round. A model critic always gives a score, and a
 * relay link runs at least once (a storyboard has a shot). A loop a person holds leaves at the end of a round, and one
 * whose gate's step may not run can reach its cap there (admission refuses that one: ST2 'feed').
 */
export const leavesOnlyAtExits = (loop: Loop): boolean => loop.gate.metric !== 'human' && gateFeed(loop).always;

/** Where a step sits, and what that means for whether it runs and whether its output is kept. */
export interface Placement {
  step: Step;
  /** The walk path (`stages[0].body.steps[2]`), as @byway/recipe's walk() writes it. */
  path: string;
  stage: Stage['stage'];
  /**
   * Inside an audit lens, a one-shot gate's body or a pick's judge: its output never reaches the work (a lens returns
   * only annotations, a gate keeps only its body's critique, a judge only names a label).
   */
  contained: boolean;
  /** Inside replicate or each: it runs once per candidate. */
  perCandidate: boolean;
  /**
   * Not on every run through its stage: inside an optional, a route, or a container, or after an exit point of an
   * enclosing loop within that loop's body (the gate may end the body before it, from the first round on).
   */
  conditional: boolean;
}

interface Where {
  contained: boolean;
  perCandidate: boolean;
  conditional: boolean;
}

/** Every step with where it sits, in walk order (pick judges and audit lenses included). */
export function placements(recipe: Recipe): Placement[] {
  const out: Placement[] = [];
  // `fed` turns true once a step that may end the loop's body has been passed in it.
  type Frame = { metric: string; fed: boolean };
  const visit = (n: Node, path: string, stage: Stage['stage'], w: Where, loop: Frame | undefined): void => {
    const after = !!loop?.fed;
    switch (n.op) {
      case 'step':
        out.push({ step: n, path, stage, contained: w.contained, perCandidate: w.perCandidate, conditional: w.conditional || after });
        if (loop && feedsGate(n, loop.metric)) loop.fed = true;
        return;
      case 'seq':
        n.steps.forEach((c, i) => visit(c, `${path}.steps[${i}]`, stage, w, loop));
        return;
      case 'loop':
        visit(n.body, `${path}.body`, stage, { ...w, conditional: w.conditional || after }, { metric: n.gate.metric, fed: false });
        return;
      case 'replicate':
      case 'each':
        visit(n.body, `${path}.body`, stage, { ...w, perCandidate: true, conditional: w.conditional || after }, undefined);
        return;
      case 'relay':
        visit(n.body, `${path}.body`, stage, w, loop);
        return;
      case 'optional':
        visit(n.body, `${path}.body`, stage, { ...w, conditional: true }, loop);
        return;
      case 'route':
        n.branches.forEach((b, i) => visit(b.body, `${path}.branches[${i}].body`, stage, { ...w, conditional: true }, loop));
        return;
      case 'audit':
        n.lenses.forEach((l, i) => visit(l.body, `${path}.lenses[${i}].body`, stage, { ...w, contained: true, conditional: true }, undefined));
        return;
      case 'gate':
        visit(n.body, `${path}.body`, stage, { ...w, contained: true, conditional: true }, undefined);
        return;
      case 'pick':
        if (n.judge) visit(n.judge, `${path}.judge`, stage, { ...w, contained: true, conditional: true }, undefined);
        return;
    }
  };
  recipe.stages.forEach((s, i) => visit(s.body, `stages[${i}].body`, s.stage, { contained: false, perCandidate: false, conditional: false }, undefined));
  return out;
}

/**
 * The steps a run always reaches when it passes their stage: not under an optional, a route, a pick's judge, an audit
 * lens or a gate body, and not after an exit point of an enclosing loop within that loop's body. A protected
 * checkpoint counts only where it runs every time, so a composed recipe cannot keep VOICE in name while placing it
 * where a model's verdict skips it.
 */
export const runsEveryTime = (recipe: Recipe): Placement[] => placements(recipe).filter((p) => !p.conditional);

/**
 * A protected checkpoint that runs every time, outside any candidate: a VOICE write (keyed by stage and scope) or the
 * author's own write (keyed by stage). COMP-1 matches a composed recipe's to its nearest recipe's one to one.
 */
export type Checkpoint = { kind: 'voice'; stage: Stage['stage']; scope: VoiceScope; placement: Placement } | { kind: 'author'; stage: Stage['stage']; placement: Placement };

export function checkpoints(recipe: Recipe): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (const p of runsEveryTime(recipe)) {
    if (p.perCandidate) continue;
    if (voiceWrite(p.step)) out.push({ kind: 'voice', stage: p.stage, scope: voiceScope(p.step, recipe.medium), placement: p });
    else if (authorWrite(p.step)) out.push({ kind: 'author', stage: p.stage, placement: p });
  }
  return out;
}

/** Whether one checkpoint stands for another: the same kind in the same stage, and for VOICE a covering scope. */
export function checkpointCovers(have: Checkpoint, want: Checkpoint): boolean {
  if (have.stage !== want.stage) return false;
  if (have.kind === 'author') return want.kind === 'author';
  return want.kind === 'voice' && covers(have.scope, want.scope);
}

/**
 * Match each wanted checkpoint to a distinct one that covers it. Narrow wants (key lines) are matched first, each to the
 * narrowest covering checkpoint left, so a wide VOICE is not spent on a want a narrow one could take.
 */
export function matchCheckpoints(want: readonly Checkpoint[], have: readonly Checkpoint[]): Map<Checkpoint, Checkpoint | undefined> {
  const narrow = (c: Checkpoint) => (c.kind === 'voice' && c.scope.keyLines ? 1 : 0);
  const used = new Set<Checkpoint>();
  const out = new Map<Checkpoint, Checkpoint | undefined>();
  for (const w of [...want].sort((a, b) => narrow(b) - narrow(a))) {
    const h = have.filter((x) => !used.has(x) && checkpointCovers(x, w)).sort((a, b) => narrow(b) - narrow(a))[0];
    if (h) used.add(h);
    out.set(w, h);
  }
  return out;
}

// ---- The held voice ---------------------------------------------------------------------------------------------

/**
 * Every executed VOICE write, wherever it sits (optional ones included): what the held voice is made of. The held
 * voice is every VOICE write on the path, in order, and a machine write declared `keepsVoice` must keep every line of
 * each of them that was in the work before it. The runner checks such a write against the whole held voice and the
 * latest words (`ports.held`, `keptVoice`; ADR-0092 stage 4, ADR-0098), and admission holds the line first: after each
 * of these, a composed recipe may have no more machine writers of a role than its nearest recipe has after the
 * counterpart VOICE (the advisor's writer allowance).
 */
export const voiceWrites = (recipe: Recipe): Placement[] => placements(recipe).filter((p) => voiceWrite(p.step));

// ---- Run order --------------------------------------------------------------------------------------------------

/**
 * A step at one place in the run, for what can run before or after it: the claims a step's explainer makes about the
 * steps around it (the advisor's present.ts), and the run's own "It is locked after this" (the interpreter).
 */
export interface Ordered {
  step: Step;
  /** Its place in the walk: a seq in order, a route's branches one after another, a pick's judge where the pick is. */
  index: number;
  /** Its stage's place in the recipe (ST4: each stage at most once, in order). */
  stage: number;
  /** The loops and relays around it: each runs its body again (a next round, a next link). */
  repeats: readonly Node[];
  /** In an audit lens, a one-shot gate's body or a pick's judge: what it makes never reaches the work. */
  contained: boolean;
  /** Inside a relay chain: it runs once per storyboard shot, each link from its own start frame (interpreter relay()). */
  inRelay: boolean;
  /** In separate sessions, one per candidate: inside each, or inside a replicate of more than one. */
  fanOut: boolean;
}

/** A final check that can send the run back to a stage: where it sits, and the stage the run starts again from. */
export interface Rerun {
  /** Its place in the walk: the steps before it have a lower index. */
  index: number;
  repeats: readonly Node[];
  /** The place of the stage the run starts again from; that stage and every later one run again. */
  from: number;
}

export interface RunOrder {
  steps: Ordered[];
  reruns: Rerun[];
}

/** Every step at every place it sits, in walk order, with the final checks that can re-run a stage. */
export function runOrder(recipe: Recipe): RunOrder {
  const steps: Ordered[] = [];
  const reruns: Rerun[] = [];
  type At = Omit<Ordered, 'step' | 'index'>;
  const visit = (n: Node, at: At): void => {
    switch (n.op) {
      case 'step':
        steps.push({ step: n, index: steps.length, ...at });
        return;
      case 'seq':
        n.steps.forEach((c) => visit(c, at));
        return;
      case 'loop':
        visit(n.body, { ...at, repeats: [...at.repeats, n] });
        return;
      case 'relay':
        visit(n.body, { ...at, repeats: [...at.repeats, n], inRelay: true });
        return;
      case 'replicate':
        visit(n.body, { ...at, fanOut: at.fanOut || n.n > 1 });
        return;
      case 'each':
        visit(n.body, { ...at, fanOut: true });
        return;
      case 'optional':
        visit(n.body, at);
        return;
      case 'route':
        n.branches.forEach((b) => visit(b.body, at));
        return;
      case 'audit':
        n.lenses.forEach((l) => visit(l.body, { ...at, contained: true }));
        return;
      case 'gate': {
        // A fail with retries left starts the run again at the first stage of the retry's name, never a later one
        // (interpreter runStages: a later one fails the run).
        const from = n.retry && n.retry.times > 0 ? recipe.stages.findIndex((s) => s.stage === n.retry!.stage) : -1;
        if (from >= 0 && from <= at.stage) reruns.push({ index: steps.length, repeats: at.repeats, from });
        visit(n.body, { ...at, contained: true });
        return;
      }
      case 'pick':
        if (n.judge) visit(n.judge, { ...at, contained: true });
        return;
    }
  };
  recipe.stages.forEach((s, i) => visit(s.body, { stage: i, repeats: [], contained: false, inRelay: false, fanOut: false }));
  return { steps, reruns };
}

/**
 * Whether `a` can run before `b` on some run, with what `a` made still in the ports `b` starts from: earlier in the
 * walk, or both in the body of one loop or relay, whose next round or link runs `a` after `b` (a step there comes
 * before itself). A final check's re-run does not count: it starts its stage again from that stage's entry ports, so
 * nothing made after them carries over. Conservative: a step in another branch of a route counts as before, which can
 * only take a claim away.
 */
export const canPrecede = (a: Ordered, b: Ordered): boolean => a.index < b.index || a.repeats.some((r) => b.repeats.includes(r));

/**
 * Whether `b` can run after `a` on some run, whatever became of what `a` made: canPrecede, or a final check after `a`
 * sends the run back to `a`'s stage or an earlier one, so every step from that stage on runs again, `a` itself among
 * them.
 */
export const canRunAfter = (order: RunOrder, a: Ordered, b: Ordered): boolean =>
  canPrecede(a, b) || order.reruns.some((g) => (a.index < g.index || a.repeats.some((r) => g.repeats.includes(r))) && a.stage >= g.from && b.stage >= g.from);

/**
 * A person's write that can change a storyboard's voice-over: their own draft (the whole work), a script VOICE, or a
 * claim log (its corrections replace the claims wherever they stand in the work, claims.ts). The on-screen VOICE is
 * refused any voice-over line (copy.ts applyOnScreen, human.ts lockedVoiceover).
 */
export const changesScript = (s: Step, medium: Medium | undefined): boolean => authorWrite(s) || (voiceWrite(s) && voiceScope(s, medium).base !== 'on-screen');

/**
 * The script VOICEs (on a storyboard, variant VOICE-early) whose script nothing the person writes later can change: no
 * write of theirs that reaches the voice-over (changesScript) can run after it, the VOICE itself again included (a
 * loop's next round, a relay's next link, a stage a final check re-runs). A machine write after it keeps the person's
 * lines (keepsVoice) or stops the run before it (the interpreter's guard). Read at every place a step object sits. The
 * run says "It is locked after this" exactly at these (wording.ts), and so does a composed recipe's explainer.
 */
export function lockedScripts(recipe: Recipe): Set<Step> {
  const order = runOrder(recipe);
  const reaching = order.steps.filter((o) => !o.contained);
  const locked = new Set<Step>();
  const not = new Set<Step>();
  for (const o of order.steps) {
    const s = o.step;
    if (!voiceWrite(s) || voiceScope(s, recipe.medium).base !== 'script') continue;
    const holds = !o.contained && !reaching.some((y) => changesScript(y.step, recipe.medium) && canRunAfter(order, o, y));
    if (!holds) {
      not.add(s);
      locked.delete(s);
    } else if (!not.has(s)) locked.add(s);
  }
  return locked;
}

// ---- The flow walk ----------------------------------------------------------------------------------------------

export interface FlowOps<S> {
  /**
   * Apply one step to the state. May record findings. `contained` says the step sits in an audit lens, a one-shot
   * gate's body or a pick's judge, where its output never reaches the work.
   */
  step(step: Step, path: string, stage: Stage['stage'], state: S, contained: boolean): S;
  /** Combine the states of alternative paths (route branches, optional ran or skipped, loop iterations, loop exits). */
  join(states: S[]): S;
  /**
   * An exact key of a state: two states with the same key are the same to every op here. With it, a node walked again
   * from a state with a key already seen there is answered from the first walk (its findings were recorded then), so
   * nested loops cost a bounded number of walks per node instead of doubling with each level. Without it, every walk is
   * made.
   */
  key?(state: S): string;
  /**
   * The state after an operator that hands on less than what ran inside it (the interpreter's replicate, each, pick,
   * audit and gate): the entry ports with the candidates' work as options (replicate, each, a pick), the entry ports with
   * the lenses' critiques and notes (an audit), the entry ports with the body's critique (a one-shot gate). `inner` is
   * the walk's own answer, and the state after when `after` is left out: the entry joined with the body (replicate,
   * each), the lenses joined (an audit), the body's (a gate) or the judge's (a pick). An analysis of one port says what
   * the operator hands on of it. May record findings, as `step` may.
   */
  after?(node: Replicate | Each | PickNode | Audit | OneShotGate, entry: S, inner: S): S;
  /**
   * The state the loop's exit gets right after an exit point, from the states before and after the step; `after` when
   * left out. A judge in a relay link with nothing to see is skipped and ends the round 'unchecked' with the ports from
   * before it (ADR-0090), so an analysis of a port that judge sets says so here.
   */
  exit?(step: Step, path: string, before: S, after: S): S;
  /**
   * Leave a loop that can leave only through its exit points (`leavesOnlyAtExits`) only through them, not also from the
   * end of its body. Off by default, so every other rule reads the walk as before. An analysis whose finding is that
   * something happens on no path (`unappliedCritiques`) sets it: there a path no run takes could hide the finding.
   */
  exactLoops?: boolean;
}

/** The exit points of the loop being walked, and the states right after each of them. */
interface LoopExits<S> {
  metric: string;
  states: S[];
}

/** What a node's walk from one state gave: the state after it, and the states it sent to the enclosing loop's exit. */
interface Walked<S> {
  out: S;
  exits: S[];
}

interface FlowWalk<S> {
  ops: FlowOps<S>;
  /** By path, containment, the enclosing loop's metric and the state's key; undefined when the walk is not memoized. */
  memo: Map<string, Walked<S>> | undefined;
}

/** Off only inside withoutFlowMemo. */
let memoOn = true;

/**
 * Run `fn` with the flow walk unmemoized: every walk made, as before memoizing. It exists for the test that holds the
 * memoized walk to the full one (the validator's flow-memo.test.ts).
 */
export function withoutFlowMemo<T>(fn: () => T): T {
  const was = memoOn;
  memoOn = false;
  try {
    return fn();
  } finally {
    memoOn = was;
  }
}

/**
 * Walk a recipe along its control flow, carrying a state: the one flow walk every path rule reads (PR6, ST12, DR7, the
 * composed profile's writer counts; ADR-0092) and the analyses here of what reaches a step. Routes and optionals fork
 * and join; a loop body (and a relay link) runs twice, so effects that reach the next iteration through the back-edge
 * are seen; per-candidate bodies (replicate, each) join with the state before them; audit lenses fork from one state
 * and join. An analysis that follows one port says, through `after`, what those operators hand on of it.
 *
 * Exit-aware: a loop's gate may end its body right after a step that reports to it (an exit point: a model critic
 * under a critic gate, a model check under a check-clean gate, reached through seq, relay, route and optional), so the
 * state after every exit point also reaches the loop's exit, and the rest of that round may not have run. May-analyses
 * are unchanged by this (an exit state is a prefix of the continuing path); must-analyses become sound.
 *
 * Containment: steps in an audit lens, a one-shot gate's body or a pick's judge are passed `contained = true`, and
 * nothing inside them reports to an enclosing loop (the interpreter runs them without the loop's context). Callers
 * record findings idempotently (the second loop pass repeats them).
 *
 * Memoized when the ops give a state key: a step's result and findings depend only on the step, its path, its stage,
 * the state and its containment, so a node walked again from an equal state, under the same enclosing loop, gives what
 * it gave the first time, and is not walked again (flow-memo.test.ts holds it to the full walk on random recipes).
 */
export function flowRecipe<S>(recipe: Recipe, initial: S, ops: FlowOps<S>): S {
  const walk: FlowWalk<S> = { ops, memo: ops.key && memoOn ? new Map() : undefined };
  let state = initial;
  recipe.stages.forEach((s, i) => {
    state = flowNode(walk, s.body, state, `stages[${i}].body`, s.stage, false, undefined);
  });
  return state;
}

function flowNode<S>(walk: FlowWalk<S>, node: Node, state: S, path: string, stage: Stage['stage'], contained: boolean, loop: LoopExits<S> | undefined): S {
  if (!walk.memo) return flowOnce(walk, node, state, path, stage, contained, loop);
  const key = `${path}|${contained ? 1 : 0}|${loop?.metric ?? ''}|${walk.ops.key!(state)}`;
  const known = walk.memo.get(key);
  if (known) {
    loop?.states.push(...known.exits);
    return known.out;
  }
  const before = loop?.states.length ?? 0;
  const out = flowOnce(walk, node, state, path, stage, contained, loop);
  walk.memo.set(key, { out, exits: loop ? loop.states.slice(before) : [] });
  return out;
}

function flowOnce<S>(walk: FlowWalk<S>, node: Node, state: S, path: string, stage: Stage['stage'], contained: boolean, loop: LoopExits<S> | undefined): S {
  const { ops } = walk;
  const after = (n: Replicate | Each | PickNode | Audit | OneShotGate, inner: S): S => (ops.after ? ops.after(n, state, inner) : inner);
  switch (node.op) {
    case 'step': {
      const out = ops.step(node, path, stage, state, contained);
      if (loop && feedsGate(node, loop.metric)) loop.states.push(ops.exit ? ops.exit(node, path, state, out) : out);
      return out;
    }
    case 'seq':
      return node.steps.reduce((s, child, i) => flowNode(walk, child, s, `${path}.steps[${i}]`, stage, contained, loop), state);
    case 'replicate':
    case 'each':
      // Candidates run without the loop's context: a critic in one does not report to an enclosing loop.
      return after(node, ops.join([state, flowNode(walk, node.body, state, `${path}.body`, stage, contained, undefined)]));
    case 'loop': {
      const own: LoopExits<S> = { metric: node.gate.metric, states: [] };
      const first = flowNode(walk, node.body, state, `${path}.body`, stage, contained, own);
      const second = flowNode(walk, node.body, ops.join([state, first]), `${path}.body`, stage, contained, own);
      // The end of a round goes on to the next round; it also leaves the loop, unless the loop can leave only at its exits.
      if (ops.exactLoops && own.states.length && leavesOnlyAtExits(node)) return ops.join(own.states);
      return ops.join([first, second, ...own.states]);
    }
    case 'relay': {
      // A relay chain repeats its link like a loop body, so effects cross from one link to the next. It hands the
      // enclosing loop's context on, so a check inside a link can end that loop's round part-way through the chain.
      const first = flowNode(walk, node.body, state, `${path}.body`, stage, contained, loop);
      const second = flowNode(walk, node.body, ops.join([state, first]), `${path}.body`, stage, contained, loop);
      return ops.join([first, second]);
    }
    case 'audit':
      // Lenses run side by side on the same input, and only annotate.
      return after(node, ops.join(node.lenses.map((l, i) => flowNode(walk, l.body, state, `${path}.lenses[${i}].body`, stage, true, undefined))));
    case 'gate':
      // A retry re-runs its stage from that stage's own entry state, so it adds no back-edge here.
      return after(node, flowNode(walk, node.body, state, `${path}.body`, stage, true, undefined));
    case 'optional':
      return ops.join([state, flowNode(walk, node.body, state, `${path}.body`, stage, contained, loop)]);
    case 'route':
      return ops.join(node.branches.map((b, i) => flowNode(walk, b.body, state, `${path}.branches[${i}].body`, stage, contained, loop)));
    case 'pick':
      return after(node, node.judge ? ops.step(node.judge, `${path}.judge`, stage, state, true) : state);
  }
}

// ---- What reaches a step ----------------------------------------------------------------------------------------

/** A step that takes in a critique: it consumes one, or reads it when it is there (ADR-0089). */
const takesCritique = (s: Step): boolean => s.consumes.includes('critique') || (s.reads?.includes('critique') ?? false);

/**
 * The judges that may be skipped where they sit: a model critic or check inside a relay link, whose view has nothing
 * to judge when the link made no clip (the interpreter's unobservable(), ADR-0090). By path: true when it reports to the
 * loop around it, whose round then ends 'unchecked' with the ports from before it; false when the run goes on past it
 * with those ports.
 */
function skippableJudges(recipe: Recipe): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const visit = (n: Node, path: string, inRelay: boolean, metric: string | undefined): void => {
    switch (n.op) {
      case 'step':
        if (inRelay && n.actor === 'model' && (n.role === 'critic' || n.role === 'check')) out.set(path, metric !== undefined && feedsGate(n, metric));
        return;
      case 'seq':
        n.steps.forEach((c, i) => visit(c, `${path}.steps[${i}]`, inRelay, metric));
        return;
      case 'loop':
        visit(n.body, `${path}.body`, inRelay, n.gate.metric);
        return;
      case 'relay':
        visit(n.body, `${path}.body`, true, metric);
        return;
      case 'optional':
        visit(n.body, `${path}.body`, inRelay, metric);
        return;
      case 'route':
        n.branches.forEach((b, i) => visit(b.body, `${path}.branches[${i}].body`, inRelay, metric));
        return;
      case 'replicate':
      case 'each':
      case 'gate':
        visit(n.body, `${path}.body`, inRelay, undefined);
        return;
      case 'audit':
        n.lenses.forEach((l, i) => visit(l.body, `${path}.lenses[${i}].body`, inRelay, undefined));
        return;
      case 'pick':
        if (n.judge) visit(n.judge, `${path}.judge`, inRelay, undefined);
        return;
    }
  };
  recipe.stages.forEach((st, i) => visit(st.body, `stages[${i}].body`, false, undefined));
  return out;
}

/**
 * A writer that applies the critique it takes in, where it sits: a machine writer (by what it runs, never by its
 * `writes` flag) that consumes the critique or reads it when it is there (ADR-0089: a read fills the same slot of its
 * prompt), and that runs in this version (`hasNoExecutor`: an ASSET that makes voice-over audio finishes skipped, ADR-0069).
 * Not where what it writes never reaches the work (`contained`: an audit lens, a one-shot gate's body or a pick's judge).
 * A person's own write is never one: the run puts a critique only in a model's prompt (the interpreter shows a person
 * the work and the latest notes, never the critique).
 */
export const appliesCritique = (s: Step, contained: boolean): boolean => !contained && machineWrites(s) && takesCritique(s) && !hasNoExecutor(s);

/** A place a step that takes in a critique sits, with the places whose critique may be the latest there when it runs. */
interface CritiqueTaker {
  step: Step;
  contained: boolean;
  /** Walk paths of the steps whose critique may be the latest; '' when none may have been given yet. */
  from: Set<string>;
}

/**
 * The one walk `critiqueSources` and `unappliedCritiques` read: what critique may be the latest at each place a step
 * that takes one in sits, by the places (walk paths) of the steps that put it there. Read on the exit-aware flow walk,
 * with the operators handing the critique on as the interpreter does:
 *
 * - A step that puts another critique in place (`replacesCritique`) is the latest one's source from then on; a write, a
 *   render or a person's taste leaves it as it was. A cliché sweep stays the source when the person chooses which of
 *   its finds are swapped (the interpreter's chooseSwaps narrows the sweep's own finds).
 * - replicate, each and a pick hand on the critique they started with; an audit its lenses' (joined under their names);
 *   a one-shot gate its body's.
 * - A judge in a relay link may be skipped, with nothing to see, and the run goes on with the critique from before it,
 *   unless it reports to the loop around it, whose round then ends there (ADR-0090). A person's answer in a lens or a
 *   gate body may be empty, which is dropped (admission refuses one there, ST9 and ST10 'human-critique').
 *
 * A may-analysis over a walk that holds every run: "may be the latest" covers every run, and "on no path" holds of every
 * run. Without `exact` the walk also leaves every loop from the end of its body, as every other rule reads it. That path
 * can only take a claim of `critiqueSources` away, but it could make a dropped answer look applied, so
 * `unappliedCritiques` reads the walk `exact` (`exactLoops`: a loop leaves only where a run can leave it).
 */
function critiqueFlow(recipe: Recipe, exact: boolean): { at: Map<string, Step>; takers: Map<string, CritiqueTaker> } {
  // A state: the places of the steps whose critique may be the latest, sorted; '' is none yet.
  const at = new Map<string, Step>();
  const takers = new Map<string, CritiqueTaker>();
  const union = (a: readonly string[], b: readonly string[]): string[] => [...new Set([...a, ...b])].sort();
  const skippable = skippableJudges(recipe);
  flowRecipe<string[]>(recipe, [''], {
    step(s, path, _stage, st, contained) {
      if (takesCritique(s)) {
        const t = takers.get(path) ?? takers.set(path, { step: s, contained, from: new Set() }).get(path)!;
        for (const x of st) t.from.add(x);
      }
      if (!replacesCritique(s)) return st;
      at.set(path, s);
      // A judge skipped where the run goes on past it, or a person's empty answer that a lens or a gate drops.
      if (skippable.get(path) === false || (s.actor === 'human' && contained)) return union(st, [path]);
      return [path];
    },
    join: (states) => states.reduce<string[]>((a, b) => union(a, b), []),
    // Walk paths hold no '|'.
    key: (st) => st.join('|'),
    after: (node, entry, inner) => (node.op === 'audit' || node.op === 'gate' ? inner : entry),
    exit: (_s, path, before, after) => (skippable.get(path) ? union(before, after) : after),
    exactLoops: exact,
  });
  return { at, takers };
}

/**
 * Whose critique a step applies: for each step that takes in a critique, the one step whose critique reaches it on
 * every path, at every place it sits. None when another step's critique can reach it instead on some path, or none
 * at all (`critiqueFlow`, by the step objects at those places).
 *
 * The presentation says a step's findings are applied only by a writer that applies them and no other critique
 * (present.ts), as the run applies them: a writer that comes next in the recipe may apply another step's critique.
 */
export function critiqueSources(recipe: Recipe): Map<Step, Step> {
  const { at, takers } = critiqueFlow(recipe, false);
  const seen = new Map<Step, Set<Step | undefined>>();
  for (const t of takers.values()) {
    const acc = seen.get(t.step) ?? seen.set(t.step, new Set()).get(t.step)!;
    for (const p of t.from) acc.add(p ? at.get(p) : undefined);
  }
  const out = new Map<Step, Step>();
  for (const [s, from] of seen) {
    const only = [...from];
    if (only.length === 1 && only[0] !== undefined) out.set(s, only[0]);
  }
  return out;
}

/**
 * A person's lists and critiques (`personCritique`) that no writer applies: the places where one is asked whose answer
 * no `appliesCritique` step takes in, on any path (`critiqueFlow`, by place, read `exact`). The run asks "What should
 * go? List what to remove", or what the next version should avoid, and drops the answer without a word: before any
 * writer that takes a critique in, another critique takes its place (a critic, a check, a CUT, a sweep, a direction of
 * the person's given as a critique, or an audit or a final check that notes anything), or none comes after it at all.
 * Admission refuses one (ST12 'critique-unapplied', ADR-0098). The walk holds every run, so no run applies an answer
 * this names; it leaves a loop only where a run can, so a critic loop's next round, which puts its own critique in
 * place of an answer given at the end of a round, is not taken for a way out with that answer.
 *
 * Some path, not every path. The paths on which an answer goes unapplied while another path applies it are chosen by
 * the person's own later answers (an optional they run or decline, a route branch, the end of a loop they hold) or by
 * a judge in a relay link skipped with nothing to see; an every-path reading would refuse those, where the person, not
 * the recipe, decides.
 */
export function unappliedCritiques(recipe: Recipe): Placement[] {
  const applied = new Set<string>();
  for (const t of critiqueFlow(recipe, true).takers.values()) if (appliesCritique(t.step, t.contained)) for (const p of t.from) applied.add(p);
  return placements(recipe).filter((p) => personCritique(p.step) && !applied.has(p.path));
}

/**
 * The AI directions (model VISION steps) that a person reacts to: on every path, the next VISION of theirs that runs
 * after the directions is shown them, and on some path one does. Decided by what reaches that step, not by order:
 *
 * - The directions reach a person's VISION as a note beside what it shows (the interpreter's beside(): the work, or
 *   the options, and the latest `ports.notes`). Every model VISION leaves one.
 * - A step that leaves a note of its own puts it in their place (`leavesNote`: a critic, check, CUT, sweep, overlap
 *   flag, another VISION or a seed's direction), and so does an audit one of whose lenses does. That step's note, not
 *   the directions, is then what the person reacts to.
 * - replicate, each, a pick and a one-shot gate hand on the notes they started with, so a note made inside them stays
 *   there; directions made inside a candidate, a lens, a gate body or a judge are never claimed.
 * - A final check that re-runs the directions' stage, or an earlier one, starts it again from that stage's entry: what
 *   the directions left is gone, so where it can still be waiting for its reaction there, no claim is made.
 *
 * Read on the exit-aware flow walk, at every place a step object sits. A must-analysis: whatever it cannot tell apart
 * (a candidate whose VISION of yours has reacted, a note in a final check's body) only takes a claim away.
 */
export function directionsReactedTo(recipe: Recipe): Set<Step> {
  // The obligation the directions leave on a path: none (IDLE), shown so far (LIVE), or replaced before it was (LOST).
  const IDLE = 1;
  const LIVE = 2;
  const LOST = 4;
  const stageAt = (stage: Stage['stage']) => recipe.stages.findIndex((s) => s.stage === stage);
  const holds = new Map<Step, boolean>();
  for (const p of placements(recipe)) {
    const v = p.step;
    if (v.actor !== 'model' || v.role !== 'vision') continue;
    let shown = false;
    let missed = p.contained || p.perCandidate;
    if (!missed) {
      const at = stageAt(p.stage);
      flowRecipe<number>(recipe, IDLE, {
        step(s, path, _stage, st) {
          if (s.actor === 'human' && s.role === 'vision') {
            if (st & LIVE) shown = true;
            if (st & LOST) missed = true;
            return IDLE;
          }
          if (s === v && path === p.path) return LIVE;
          return leavesNote(s) && st & LIVE ? (st & ~LIVE) | LOST : st;
        },
        join: (states) => states.reduce((a, b) => a | b, 0),
        key: String,
        after(node, entry, inner) {
          if (node.op === 'audit') return inner;
          if (node.op === 'gate' && node.retry && node.retry.times > 0) {
            const from = stageAt(node.retry.stage);
            if (from >= 0 && from <= at && inner & (LIVE | LOST)) missed = true;
          }
          return entry;
        },
      });
    }
    holds.set(v, (holds.get(v) ?? true) && shown && !missed);
  }
  return new Set([...holds].flatMap(([s, ok]) => (ok ? [s] : [])));
}

// ---- Field roles ------------------------------------------------------------------------------------------------

/**
 * How each field of a recipe takes part in what it does:
 * - `name`: an id or a text shown to people; renaming it changes nothing that runs;
 * - `child`: a nested node or schema object, classified field by field in turn;
 * - `semantic`: a value execution acts on;
 * - `semantic-set`: a list execution reads as a set (its order does not matter anywhere it is read).
 */
export type FieldRole = 'name' | 'child' | 'semantic' | 'semantic-set';

/** Every field of `T`, optional ones included, mapped to its role: a field left out fails typecheck. */
export type FieldRoles<T> = { readonly [K in keyof Required<T>]: FieldRole };

type Lens = Audit['lenses'][number];
type Branch = Route['branches'][number];
type Retry = NonNullable<OneShotGate['retry']>;

/** The role of every field of every schema object, so a field added to the schema must be classified to compile. */
export const FIELD_ROLES: {
  recipe: FieldRoles<Recipe>;
  stage: FieldRoles<Stage>;
  step: FieldRoles<Step>;
  seq: FieldRoles<Seq>;
  replicate: FieldRoles<Replicate>;
  each: FieldRoles<Each>;
  pick: FieldRoles<PickNode>;
  loop: FieldRoles<Loop>;
  gate: FieldRoles<Gate>;
  route: FieldRoles<Route>;
  branch: FieldRoles<Branch>;
  optional: FieldRoles<Optional>;
  audit: FieldRoles<Audit>;
  lens: FieldRoles<Lens>;
  oneShotGate: FieldRoles<OneShotGate>;
  pass: FieldRoles<PassCondition>;
  retry: FieldRoles<Retry>;
  relay: FieldRoles<RelayChain>;
} = {
  recipe: {
    schema: 'semantic',
    id: 'name',
    title: 'name',
    kind: 'semantic',
    family: 'semantic',
    channel: 'semantic',
    medium: 'semantic',
    parent: 'semantic',
    inputs: 'semantic-set',
    stages: 'child',
    sitsOut: 'semantic-set',
    exceptions: 'semantic-set',
    bank: 'semantic',
    hash: 'name',
  },
  stage: { stage: 'semantic', body: 'child' },
  step: {
    op: 'semantic',
    id: 'name',
    role: 'semantic',
    block: 'semantic',
    glue: 'semantic',
    actor: 'semantic',
    tier: 'semantic',
    isolated: 'semantic',
    frozenPrompt: 'semantic',
    prompt: 'semantic',
    // Read in order: the runner lays out the images a step sees port by port (buildPrompt), so a reordering is a change.
    consumes: 'semantic',
    // What a step's prompt receives when it is there (ADR-0089): a read port fills its slot, or an empty one, and
    // buildPrompt walks the reads after the consumed ports, in order, laying out their images as it goes.
    reads: 'semantic',
    produces: 'semantic-set',
    writes: 'semantic',
    keepsVoice: 'semantic',
    proxyFor: 'semantic',
    knobs: 'semantic',
    variant: 'semantic',
  },
  seq: { op: 'semantic', id: 'name', steps: 'child' },
  replicate: { op: 'semantic', id: 'name', n: 'semantic', body: 'child' },
  each: { op: 'semantic', id: 'name', body: 'child' },
  pick: { op: 'semantic', id: 'name', mode: 'semantic', k: 'semantic', actor: 'semantic', judge: 'child' },
  loop: { op: 'semantic', id: 'name', body: 'child', gate: 'child' },
  gate: {
    metric: 'semantic',
    threshold: 'semantic',
    hidden: 'semantic',
    holder: 'semantic',
    probe: 'semantic',
    max: 'semantic',
    plateau: 'semantic',
    onCap: 'semantic',
    onNoConverge: 'semantic',
  },
  // A route's id keys the run's up-front route choices. `on` is what the person is asked to choose on at run time
  // (routePrompt; the catalog's plain question stands in only for a catalog recipe), as an optional's trigger is.
  route: { op: 'semantic', id: 'semantic', on: 'semantic', branches: 'child' },
  // A branch is chosen by its name.
  branch: { name: 'semantic', body: 'child' },
  // The trigger is what the person is asked to decide on.
  optional: { op: 'semantic', id: 'name', trigger: 'semantic', body: 'child' },
  audit: { op: 'semantic', id: 'name', lenses: 'child' },
  // Lens critiques are joined under their names.
  lens: { name: 'semantic', body: 'child' },
  oneShotGate: { op: 'semantic', id: 'name', body: 'child', pass: 'child', retry: 'child', onFail: 'semantic' },
  pass: { metric: 'semantic', threshold: 'semantic', hidden: 'semantic', holder: 'semantic' },
  retry: { stage: 'semantic', times: 'semantic' },
  relay: { op: 'semantic', id: 'name', maxLinks: 'semantic', body: 'child' },
};
