/**
 * What a `byway.recipe/1` recipe does when it runs, written down once (ADR-0092).
 *
 * The runner's interpreter is the truth, and this module mirrors it. It decides:
 * - who changes the work, from a step's actor, role and the ports it produces (never from `writes`);
 * - whose words go into the work, from actor, role and `produces: ['artifact']` (never from the 'voice' port);
 * - what a VOICE covers, from `variant`, the knobs and the run's medium;
 * - which protocol block a step is, from its role (the runner reads `block` only for labels);
 * - whether a step's output is kept, from the operator it sits in;
 * - where a loop's gate can end the loop's body, from the operators between the loop and its critic or check.
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
 * each of them that was in the work before it. The runner checks such a write against the latest VOICE answer only
 * (`ports.voice`), so admission holds the line: after each of these, a composed recipe may have no more machine
 * writers of a role than its nearest recipe has after the counterpart VOICE (the advisor's writer allowance).
 * Checking the whole held voice at run time is a later stage of ADR-0092.
 */
export const voiceWrites = (recipe: Recipe): Placement[] => placements(recipe).filter((p) => voiceWrite(p.step));

// ---- Field roles ------------------------------------------------------------------------------------------------

/**
 * How each field of a recipe takes part in what it does:
 * - `name`: an id or a text shown to people; renaming it changes nothing that runs;
 * - `child`: a nested node or schema object, classified field by field in turn;
 * - `semantic`: a value execution acts on;
 * - `semantic-set`: a list execution reads as a set (its order does not matter).
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
    consumes: 'semantic-set',
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
  // A route's id keys the run's up-front route choices, so it is semantic; `on` is the question shown to the person.
  route: { op: 'semantic', id: 'semantic', on: 'name', branches: 'child' },
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
