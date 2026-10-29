/**
 * How much work a recipe can make a run do, and the limits on it (F02, ADR-0092 stage 2).
 *
 * The interpreter expands replicate, each and audit eagerly, every branch at once, and Temporal's own limits are the
 * only ceiling it meets otherwise: about 2,000 activities pending per workflow, a 4 MB scheduling batch and a 5 s
 * workflow task. A run that hits one is not failed by byway; it wedges, still "running", and Cancel may not reach it.
 * So the counts that shape work are bounded before a run starts, by who controls them:
 * - ENGINE_LIMITS hold for every recipe, research-frozen ones included: the validator reports them as ST3 'limit',
 *   and the runner's start and the workflow's start refuse a recipe over them (engineProblems), whatever admitted it.
 * - COMPOSED_LIMITS hold for model-authored recipes only (the composed profile's COMPOSED-LIMIT), much tighter, since a
 *   model's answer, not a person, chose their counts.
 *
 * workBound walks the recipe the way the estimator does (replicate sets the option count, each multiplies by it, audit
 * sums its lenses, a C pick asks its judge k times, a loop multiplies by its rounds with the one raise a person may
 * allow at the cap, a relay by its links, a gate's retry re-runs its stages). It is an upper bound because a retrying
 * gate may not sit inside a fan-out (ST10 'retry-scope'): there a retry would restart its stage while the sibling
 * branches kept running and spending.
 *
 * Pure: no Node built-ins, and nothing imported but types, semantics.ts and walk.ts, so workflow code can import it through
 * `@byway/recipe/limits`.
 */
import type { Gate, Node, OneShotGate, Pick as PickNode, Recipe, Stage, Step } from './schema.ts';
import { PICK_JUDGE_ROLES, countWalkVisit } from './semantics.ts';
import { children as childNodes } from './walk.ts';

/** Automatic re-runs after a failed one-shot gate (02 §2 Retry: "bounded", e.g. once). */
export const MAX_GATE_RETRIES = 3;

export const ENGINE_LIMITS = {
  /** Activities in flight at once. Temporal refuses a workflow more than 2,000 pending; checkpoints and retries need room. */
  peak: 500,
  /** Step runs in the worst case (every loop to its raised cap, every retry taken). The catalog's most is C5's. */
  stepRuns: 2000,
  /** Automatic re-runs of a one-shot gate. */
  gateRetries: MAX_GATE_RETRIES,
  /**
   * Bytes of the activity inputs in flight at once, by what the counts decide (ACTIVITY_BYTES). Temporal refuses a
   * workflow task whose commands pass 4 MB; half of it is left for what still travels by value and the counts do not
   * decide: the person's reactions and what models write (the brief and the person's own files travel as their ids, P2).
   */
  batchBytes: 2 * 1024 * 1024,
} as const;

/**
 * Limits on a recipe a model composed (ADR-0058's composed profile), far inside the engine's. The catalog's largest
 * counts: replicate 12 (C2), loop rounds 10, relay links 4, lenses 3, depth 6, 42 nodes, 6.3 KB, 201 step runs (C5, as
 * workBound counts them).
 */
export const COMPOSED_LIMITS = {
  replicate: 16,
  loopMax: 12,
  relayLinks: 8,
  lenses: 4,
  peak: 32,
  stepRuns: 400,
  /** Operators nested in operators. */
  depth: 12,
  /** Steps and operators, a pick's judge included. */
  nodes: 100,
  /** The recipe as JSON. */
  bytes: 32 * 1024,
} as const;

/**
 * What one activity's input costs in bytes, by the parts the recipe's counts decide, measured from the interpreter
 * (runner limits-batch.test.ts drives the real Interpreter and weighs what it schedules):
 * - `base`: what every input carries whatever the counts: the run's own fields (the brief and the person's own inputs
 *   by their files' ids), the call, the ports' single ids, and Temporal's command around it (the step's own JSON is
 *   added as it is). Measured on 2026-10-22, once the seeds stopped travelling: an input with empty ports weighs about
 *   420 bytes besides its step, and the command around it about 160 (a ScheduleActivityTask command encoded with
 *   @temporalio/proto 1.24.0, with the proxies' timeouts and retry policy); the rest is for the ports' single ids;
 * - `id`: one artifact id in a list: an option, a pick's or a judge's candidate, an image a pool render is given;
 * - `view`: one view in the ports, at its largest (a web page's: 17 screenshots, listed by image and by surface). The
 *   work's own view, every option's view after a fan-out, and a pool render's view of them all.
 * The SEED strings handed out are not counted: they no longer travel (P2; the runner's write checks read them from the
 * store), so a recipe refused only for the seeds its fan-outs carried now runs. What models write (critiques, briefs)
 * and the person's reactions are not counted either: they still travel by value.
 */
export const ACTIVITY_BYTES = { base: 896, id: 76, view: 2.75 * 1024 } as const;

/** A loop's rounds: the planned cap, and the cap after the one raise a person may allow there (ADR-0073, ADR-0093). */
export function loopRounds(gate: Pick<Gate, 'max' | 'onCap'>): { planned: number; withRaise: number } {
  const planned = Math.max(1, gate.max);
  return { planned, withRaise: gate.onCap === 'human' ? 2 * planned : planned };
}

/** What the counts put in the ports at a point: the option list, the options' views, and the items of the current view. */
interface Shape {
  options: number;
  optionViews: number;
  view: number;
}

const joinShapes = (...shapes: Shape[]): Shape => ({
  options: Math.max(0, ...shapes.map((s) => s.options)),
  optionViews: Math.max(0, ...shapes.map((s) => s.optionViews)),
  view: Math.max(0, ...shapes.map((s) => s.view)),
});

interface Work {
  /** Step runs, a C pick's judge calls included. */
  runs: number;
  /** Activities in flight at once. */
  peak: number;
  /** Bytes of the activity inputs in flight at once. */
  bytes: number;
  /** The ports after the node. */
  after: Shape;
}

export interface WorkBound {
  stepRuns: number;
  peak: number;
  /** Bytes of the activity inputs in flight at once, at most. */
  batchBytes: number;
  /** The fan-out (replicate, each or audit) with the most bytes in flight, if any. */
  widest?: { path: string; bytes: number };
}

const stepBytes = (s: Step): number => JSON.stringify(s).length;

/** A render of the option set as one pool (runner interpreter): it is given the options, not the work. */
const poolRender = (s: Step): boolean => s.actor === 'tool' && s.role === 'render' && s.consumes.includes('option_set<artifact>') && !s.consumes.includes('artifact');

/** One walk of the recipe, every count at its worst. */
class Walker {
  widest: { path: string; bytes: number } | undefined;
  /**
   * By path and the ports' shape: a loop or relay body is walked a second time from what its first round left, and
   * without this a nest of them would cost two to the power of its depth.
   */
  private readonly memo = new Map<string, Work>();

  /** One activity's input: its step, and what of the ports it carries (`ids` listed, `views` carried). */
  private activity(step: Step | undefined, ids: number, views: number): number {
    const B = ACTIVITY_BYTES;
    return B.base + (step ? stepBytes(step) : 0) + B.id * ids + B.view * views;
  }

  /** An activity that carries the ports as they are. */
  private withPorts(step: Step | undefined, at: Shape, extraIds = 0): number {
    return this.activity(step, at.options + extraIds, at.optionViews + at.view);
  }

  private fanOut(path: string, w: Work): Work {
    if (!this.widest || w.bytes > this.widest.bytes) this.widest = { path, bytes: w.bytes };
    return w;
  }

  node(n: Node, at: Shape, path: string): Work {
    countWalkVisit();
    const key = `${path}|${at.options}|${at.optionViews}|${at.view}`;
    const known = this.memo.get(key);
    if (known) return known;
    const w = this.walk(n, at, path);
    this.memo.set(key, w);
    return w;
  }

  private step(s: Step, at: Shape): Work {
    const one = { runs: 1, peak: 1 };
    if (s.actor === 'tool' && s.role === 'render') {
      // A render is given artifact ids, not the ports; a pool render's view then holds every option's view, twice.
      const pool = poolRender(s);
      const after = pool ? { ...at, optionViews: at.options, view: at.options } : { ...at, view: 1 };
      return { ...one, bytes: this.activity(s, pool ? at.options : 1, 0), after };
    }
    // A step with no executor finishes as a skip, given only itself.
    if (s.actor === 'policy' || s.actor === 'tool') return { ...one, bytes: this.activity(s, 0, 0), after: at };
    return { ...one, bytes: this.withPorts(s, at), after: at };
  }

  private walk(n: Node, at: Shape, path: string): Work {
    switch (n.op) {
      case 'step':
        return this.step(n, at);
      case 'seq': {
        let cur = at;
        const out = { runs: 0, peak: 0, bytes: 0 };
        n.steps.forEach((c, i) => {
          const w = this.node(c, cur, `${path}.steps[${i}]`);
          out.runs += w.runs;
          out.peak = Math.max(out.peak, w.peak);
          out.bytes = Math.max(out.bytes, w.bytes);
          cur = w.after;
        });
        return { ...out, after: cur };
      }
      case 'replicate': {
        // Every branch starts from the same ports, the options before it included; then each is an option, with its view.
        const k = Math.max(1, n.n);
        const b = this.node(n.body, at, `${path}.body`);
        return this.fanOut(path, { runs: k * b.runs, peak: k * b.peak, bytes: k * b.bytes, after: { options: k, optionViews: k, view: at.view } });
      }
      case 'each': {
        // One branch per option (the work itself when there are none), each with its own view and no option list.
        const k = Math.max(1, at.options);
        const b = this.node(n.body, { options: 0, optionViews: 0, view: 1 }, `${path}.body`);
        return this.fanOut(path, { runs: k * b.runs, peak: k * b.peak, bytes: k * b.bytes, after: { options: k, optionViews: k, view: at.view } });
      }
      case 'audit': {
        const lenses = n.lenses.map((l, i) => this.node(l.body, at, `${path}.lenses[${i}].body`));
        const sum = (f: (w: Work) => number) => lenses.reduce((s, w) => s + f(w), 0);
        return this.fanOut(path, { runs: sum((w) => w.runs), peak: sum((w) => w.peak), bytes: sum((w) => w.bytes), after: at });
      }
      case 'pick': {
        const k = Math.max(1, n.k);
        const from = Math.max(1, at.options);
        const after = { options: Math.min(k, from), optionViews: Math.min(k, from), view: Math.max(1, at.view) };
        // H asks once, listing every option and its view; R draws; C asks its judge once per choice, with the ports and
        // the candidates.
        if (n.mode === 'C') return { runs: k, peak: 1, bytes: this.withPorts(n.judge, at, from), after };
        if (n.mode === 'H') return { runs: 0, peak: 1, bytes: this.activity(undefined, 2 * from, 0), after };
        return { runs: 0, peak: 0, bytes: 0, after };
      }
      case 'loop':
      case 'relay': {
        const times = n.op === 'loop' ? loopRounds(n.gate).withRaise : Math.max(1, n.maxLinks);
        // A later round starts from what the round before left; the shapes settle after a second round.
        const first = this.node(n.body, at, `${path}.body`);
        const second = this.node(n.body, joinShapes(at, first.after), `${path}.body`);
        // A scored loop's way out re-ranks its best versions in one more call.
        const rerank = n.op === 'loop' && (n.gate.metric === 'critic-score' || n.gate.metric === 'critic-rank') ? 1 : 0;
        return {
          runs: times * Math.max(first.runs, second.runs) + rerank,
          peak: Math.max(first.peak, second.peak),
          bytes: Math.max(first.bytes, second.bytes),
          after: joinShapes(first.after, second.after),
        };
      }
      case 'route': {
        const ws = n.branches.map((b, i) => this.node(b.body, at, `${path}.branches[${i}].body`));
        const max = (f: (w: Work) => number) => Math.max(0, ...ws.map(f));
        return { runs: max((w) => w.runs), peak: max((w) => w.peak), bytes: max((w) => w.bytes), after: joinShapes(...ws.map((w) => w.after)) };
      }
      case 'optional': {
        const b = this.node(n.body, at, `${path}.body`);
        return { ...b, after: joinShapes(at, b.after) };
      }
      case 'gate': {
        // The gate keeps only its body's critique: the ports after it are the ports before it.
        const b = this.node(n.body, at, `${path}.body`);
        return { ...b, after: at };
      }
    }
  }
}

/** Every one-shot gate with a retry, with its stage. */
function retryingGates(recipe: Recipe): { gate: OneShotGate; stage: Stage['stage'] }[] {
  const out: { gate: OneShotGate; stage: Stage['stage'] }[] = [];
  const visit = (n: Node, stage: Stage['stage']): void => {
    if (n.op === 'gate' && n.retry) out.push({ gate: n, stage });
    for (const c of childNodes(n)) visit(c, stage);
  };
  for (const s of recipe.stages) visit(s.body, s.stage);
  return out;
}

function walkStages(recipe: Recipe): { w: Walker; runs: number; peak: number; bytes: number } {
  const w = new Walker();
  let at: Shape = { options: 0, optionViews: 0, view: 0 };
  let peak = 0;
  let bytes = 0;
  const runs = new Map<Stage['stage'], number>();
  recipe.stages.forEach((s, i) => {
    const r = w.node(s.body, at, `stages[${i}].body`);
    runs.set(s.stage, r.runs);
    peak = Math.max(peak, r.peak);
    bytes = Math.max(bytes, r.bytes);
    at = r.after;
  });
  // A retry re-runs the stages from its target through its own, at most `times` times (the count is per gate, for the run).
  let extraRuns = 0;
  for (const { gate, stage } of retryingGates(recipe)) {
    const from = recipe.stages.findIndex((s) => s.stage === gate.retry!.stage);
    const to = recipe.stages.findIndex((s) => s.stage === stage);
    if (from < 0 || from > to) continue;
    const times = Math.max(0, gate.retry!.times);
    for (const s of recipe.stages.slice(from, to + 1)) extraRuns += times * (runs.get(s.stage) ?? 0);
  }
  return { w, runs: [...runs.values()].reduce((a, b) => a + b, 0) + extraRuns, peak, bytes };
}

/** The most work a run of this recipe can do, and how much of it can be in flight at once. */
export function workBound(recipe: Recipe): WorkBound {
  const walked = walkStages(recipe);
  return {
    stepRuns: walked.runs,
    peak: walked.peak,
    batchBytes: walked.bytes,
    ...(walked.w.widest ? { widest: walked.w.widest } : {}),
  };
}

// ---- What each entry refuses ------------------------------------------------------------------------------------

/** A problem that keeps a recipe from running at all, with the rule and clause the validator reports it under. */
export interface EngineProblem {
  ruleId: 'ST3' | 'ST7' | 'ST10' | 'ST12';
  clause: 'count' | 'limit' | 'retry-count' | 'retry-scope' | 'pick-judge' | 'slots';
  path: string;
  message: string;
}

const positiveInt = (n: number): boolean => Number.isSafeInteger(n) && n >= 1;

/** Whether a C pick can be decided: the interpreter asks a model judge or select step for a label. */
export const pickJudgeOk = (p: Pick<PickNode, 'mode' | 'judge'>): boolean =>
  p.mode !== 'C' || (p.judge !== undefined && p.judge.actor === 'model' && PICK_JUDGE_ROLES.has(p.judge.role));

/**
 * Every operator in the recipe with its path, and whether it sits inside replicate, each or an audit lens (where its
 * branches run side by side).
 */
function operators(recipe: Recipe): { node: Node; path: string; inFanOut: boolean }[] {
  const out: { node: Node; path: string; inFanOut: boolean }[] = [];
  const visit = (n: Node, path: string, inFanOut: boolean): void => {
    out.push({ node: n, path, inFanOut });
    const inner = inFanOut || n.op === 'replicate' || n.op === 'each' || n.op === 'audit';
    switch (n.op) {
      case 'step':
        return;
      case 'seq':
        n.steps.forEach((c, i) => visit(c, `${path}.steps[${i}]`, inner));
        return;
      case 'route':
        n.branches.forEach((b, i) => visit(b.body, `${path}.branches[${i}].body`, inner));
        return;
      case 'audit':
        n.lenses.forEach((l, i) => visit(l.body, `${path}.lenses[${i}].body`, inner));
        return;
      case 'pick':
        if (n.judge) visit(n.judge, `${path}.judge`, inner);
        return;
      default:
        visit(n.body, `${path}.body`, inner);
    }
  };
  recipe.stages.forEach((s, i) => visit(s.body, `stages[${i}].body`, false));
  return out;
}

const KB = (b: number) => `${Math.round(b / 1024)} KB`;

/**
 * What keeps a recipe from running on the engine, whoever admitted it: counts that are not positive whole numbers or
 * pass the engine's limits, a C pick nobody can decide, a retrying gate inside a fan-out, and an ASSET step whose
 * slots knob is not a whole number of at least 1 (it would pay for its briefs and make no image, or a fraction of one;
 * SLOTS-KNOB). Runner.start and the workflow's start refuse a recipe with any; the validator reports the same as ST3,
 * ST7, ST10 and ST12 findings (ST7's knob range for the slots knob). It holds no product policy (no VOICE, no
 * composed limits).
 */
export function engineProblems(recipe: Recipe): EngineProblem[] {
  const out: EngineProblem[] = [];
  const count = (path: string, what: string, n: number, max?: number) => {
    if (!positiveInt(n)) out.push({ ruleId: 'ST3', clause: 'count', path, message: `${what} is ${n}; it must be a whole number of at least 1` });
    else if (max !== undefined && n > max) out.push({ ruleId: 'ST3', clause: 'limit', path, message: `${what} is ${n}; the engine allows at most ${max}` });
  };
  for (const { node: n, path, inFanOut } of operators(recipe)) {
    if (n.op === 'replicate') count(path, `replicate "${n.id}"'s count`, n.n, ENGINE_LIMITS.peak);
    if (n.op === 'pick') {
      count(path, `pick "${n.id}"'s k`, n.k);
      if (!pickJudgeOk(n)) out.push({ ruleId: 'ST12', clause: 'pick-judge', path, message: `pick "${n.id}" chooses by a judge (mode C), but has no model judge or select step to ask` });
    }
    if (n.op === 'loop') {
      count(path, `loop "${n.id}"'s probe`, n.gate.probe);
      count(path, `loop "${n.id}"'s cap`, n.gate.max, ENGINE_LIMITS.stepRuns);
    }
    if (n.op === 'relay') count(path, `relay "${n.id}"'s links`, n.maxLinks, ENGINE_LIMITS.stepRuns);
    // Knobs are free JSON in a recipe, and the activity caps the images by this one: not a count the work bound reads.
    if (n.op === 'step' && n.role === 'asset' && n.knobs && Object.hasOwn(n.knobs, 'slots')) {
      const slots = n.knobs.slots;
      if (!(typeof slots === 'number' && positiveInt(slots))) {
        out.push({ ruleId: 'ST7', clause: 'slots', path, message: `ASSET step "${n.id}"'s slots knob is ${JSON.stringify(slots)}; it must be a whole number of at least 1` });
      }
    }
    if (n.op === 'gate' && n.retry) {
      if (!positiveInt(n.retry.times) || n.retry.times > ENGINE_LIMITS.gateRetries) {
        out.push({ ruleId: 'ST10', clause: 'retry-count', path, message: `gate "${n.id}" retries ${n.retry.times} times; a retry is 1 to ${ENGINE_LIMITS.gateRetries} automatic re-runs` });
      }
      if (inFanOut) {
        out.push({
          ruleId: 'ST10',
          clause: 'retry-scope',
          path,
          message: `gate "${n.id}" retries a stage from inside replicate, each or an audit lens; a retry restarts the stage while the branches beside it keep running, so a retrying gate sits at stage level`,
        });
      }
    }
  }
  // The bound is computed only for counts it can trust: a count that is not a positive whole number is reported above.
  if (out.some((p) => p.clause === 'count')) return out;
  const b = workBound(recipe);
  // Written as 'not within', so a bound that overflowed to NaN or Infinity is over too.
  if (!(b.peak <= ENGINE_LIMITS.peak)) out.push({ ruleId: 'ST3', clause: 'limit', path: '(recipe)', message: `up to ${b.peak} steps can run at once; the engine allows ${ENGINE_LIMITS.peak}` });
  if (!(b.stepRuns <= ENGINE_LIMITS.stepRuns)) out.push({ ruleId: 'ST3', clause: 'limit', path: '(recipe)', message: `a run can take up to ${b.stepRuns} steps; the engine allows ${ENGINE_LIMITS.stepRuns}` });
  if (!(b.batchBytes <= ENGINE_LIMITS.batchBytes)) {
    out.push({
      ruleId: 'ST3',
      clause: 'limit',
      path: b.widest?.path ?? '(recipe)',
      message: `the steps that can run at once here carry up to ${KB(b.batchBytes)} between them (the options and their views in every one); the engine allows ${KB(ENGINE_LIMITS.batchBytes)}`,
    });
  }
  return out;
}

// ---- The composed limits ----------------------------------------------------------------------------------------

/** How deep operators nest (a step alone is 1), and how many steps and operators there are. */
export function recipeSize(recipe: Recipe): { depth: number; nodes: number; bytes: number } {
  let nodes = 0;
  const depthOf = (n: Node): number => {
    nodes++;
    return 1 + Math.max(0, ...childNodes(n).map(depthOf));
  };
  const depth = Math.max(0, ...recipe.stages.map((s) => depthOf(s.body)));
  return { depth, nodes, bytes: JSON.stringify(recipe).length };
}

/** Where a model-composed recipe goes past COMPOSED_LIMITS (the engine's own limits are checked by engineProblems). */
export function composedLimitProblems(recipe: Recipe): { path: string; message: string }[] {
  const out: { path: string; message: string }[] = [];
  const L = COMPOSED_LIMITS;
  const over = (path: string, what: string, n: number, max: number) => {
    if (!(n <= max)) out.push({ path, message: `${what} is ${n}; a composed recipe may have at most ${max}` });
  };
  for (const { node: n, path } of operators(recipe)) {
    if (n.op === 'replicate') over(path, `replicate "${n.id}"'s count`, n.n, L.replicate);
    if (n.op === 'loop') over(path, `loop "${n.id}"'s rounds`, n.gate.max, L.loopMax);
    if (n.op === 'relay') over(path, `relay "${n.id}"'s links`, n.maxLinks, L.relayLinks);
    if (n.op === 'audit') over(path, `audit "${n.id}"'s lenses`, n.lenses.length, L.lenses);
  }
  const size = recipeSize(recipe);
  over('(recipe)', 'the nesting of its operators', size.depth, L.depth);
  over('(recipe)', 'the number of its steps and operators', size.nodes, L.nodes);
  if (size.bytes > L.bytes) out.push({ path: '(recipe)', message: `it is ${KB(size.bytes)} as JSON; a composed recipe may be at most ${KB(L.bytes)}` });
  // The work bound needs counts it can trust; the engine's checks report the rest.
  if (out.length || engineProblems(recipe).some((p) => p.clause === 'count')) return out;
  const b = workBound(recipe);
  over('(recipe)', 'the steps that can run at once', b.peak, L.peak);
  over('(recipe)', 'the steps a run can take', b.stepRuns, L.stepRuns);
  return out;
}
