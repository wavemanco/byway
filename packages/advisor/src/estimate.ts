import type { CostEstimate, Medium, ModelProfile, ProblemBrief, Tier } from '@byway/contracts';
import { FAL_VIDEO_EXTRAS, PRICES, falVideoSeconds, maxCompletionCost, priceFor, textTokens, tokenCost, type PriceRow } from '@byway/gateway';
import { GREAT_MIN_REFERENCES, problemSlot } from '@byway/prompts/pure';
import { MEDIUM_FORMAT } from '@byway/protocol';
import { asksSwaps, audioAsset, exitPoints, loopRounds, promptShows, type Gate, type Loop, type Node, type Recipe, type Seq, type Stage, type Step } from '@byway/recipe';
import { AdvisorError } from './errors.ts';

/**
 * Cost estimates (product spec §4 "Estimates"): a structural walk of the recipe — replicate counts, loop 1..max
 * ranges, steps per stage, optional and route branches, images, relay clips and human checkpoints — priced with the
 * profile's models at the gateway's dated price table. The result is a low–high range, because the run decides how
 * many rounds a loop takes, whether an optional step runs and which branch a route takes.
 *
 * It is an estimate, not a quote: the gateway's spend book is the source of truth for spend (spec §3.3, ADR-0095), and
 * the run's budget is what actually stops spending (§3.4).
 */

/** What the profile can do now: its models, and whether its image and video providers have keys (ProfileStatus). */
export interface PricingContext {
  profile: ModelProfile;
  /** True when the profile's image model is usable; otherwise ASSET steps make no images. */
  images: boolean;
  /** True when the profile's video model is usable; otherwise relay links finish skipped (ADR-0069) and cost nothing. */
  video: boolean;
  /**
   * True when the profile's other-family critic is usable (ProfileStatus.otherFamily, contracts v5): critics whose family
   * knob is 'other' then run on it and are priced at its model; otherwise a fresh session of the profile's own big tier
   * reviews (convention C3) and they are priced at that.
   */
  otherFamily?: boolean;
  prices?: readonly PriceRow[];
  /** The date whose prices apply. */
  at: Date;
  /**
   * The person's problem, attachments included, when it is known: each prompt that shows it (promptShows, the `intent`
   * port) is then sized with it, as the gateway sizes the call (textTokens), so a long brief raises the figures, the
   * default budget and the long-context tier a call reaches. Without it every prompt is planned at `PROMPT_TOKENS`.
   */
  problem?: ProblemBrief;
  /**
   * The size in tokens of the work already made, when it is known (the work beside a run's question): the work as text,
   * and a text view of it, are then sized with it instead of the planning sizes. A view of screenshots or frames keeps
   * its planning size.
   */
  workTokens?: number;
}

/**
 * Typical tokens per call, by role or helper (input, output), for an artifact of `ARTIFACT_TOKENS` and a view of
 * `VIEW_TOKENS`, or of the sizes known (PricingContext `problem` and `workTokens`). They are planning numbers, written
 * down so they can be checked against the ledger:
 * - every prompt carries about 1,500 tokens of instructions, the problem and the brief (`PROMPT_TOKENS`); about 1,000
 *   of them are the template's own words (`INSTRUCTION_TOKENS`), so a prompt that shows a problem longer than the
 *   other 500 grows by the difference;
 * - writers (build, seed) produce one artifact; revisers (fix, asset.integrate) read one and a critique and produce one
 *   (VOICE makes no model call: ADR-0081);
 * - readers of the work (critic, check, cut, tells, vision, dedupe, overlap) read its view and answer briefly; the TELLS
 *   sweep also reads a tell catalog of about 2,500 tokens;
 * - judges read every candidate's view; a GREAT critic reads the references too (low: none, ADR-0071's OK fallback;
 *   high: its `refs` knob, at least 3, else up to 10), once per lineup order its `shuffles` knob asks for;
 * - relay links answer a short clip prompt; ASSET first asks for image briefs.
 */
export const PROMPT_TOKENS = 1500;
export const INSTRUCTION_TOKENS = 1000;
const CRITIQUE_TOKENS = 800;
const TELLS_CATALOG_TOKENS = 2500;

/** The work as text, by medium: a single-file page is long; a memo, a storyboard or a diff much shorter. */
export const ARTIFACT_TOKENS: Readonly<Record<Medium, number>> = { 'web-page': 6000, prose: 1500, options: 2000, media: 1500, 'code-diff': 2500 };

/** What a reader of the work sees, by medium: page screenshots (about three tiles) and storyboard frames cost more. */
export const VIEW_TOKENS: Readonly<Record<Medium, number>> = { 'web-page': 5000, prose: 1500, options: 2000, media: 4000, 'code-diff': 2500 };

interface Tokens {
  input: number;
  output: number;
}

/** What a call's tokens are planned from: its prompt (instructions and problem), the work as text, and a view of it. */
export interface CallSizes {
  prompt: number;
  art: number;
  view: number;
}

type TokenRule = (z: CallSizes, readers: number) => Tokens;

/** Per-role token assumptions; `readers` is how many views the call reads (candidates, or references plus ours). */
export const TOKEN_ASSUMPTIONS: Readonly<Record<string, TokenRule>> = {
  build: (z) => ({ input: z.prompt, output: z.art }),
  seed: (z) => ({ input: z.prompt, output: z.art }),
  fix: (z) => ({ input: z.prompt + z.art + CRITIQUE_TOKENS, output: z.art }),
  'asset.integrate': (z) => ({ input: z.prompt + z.art, output: z.art }),
  'asset.briefs': (z) => ({ input: z.prompt + z.art, output: 600 }),
  critic: (z, readers) => ({ input: z.prompt + z.view * readers, output: CRITIQUE_TOKENS }),
  judge: (z, readers) => ({ input: z.prompt + z.view * readers, output: 400 }),
  select: (z, readers) => ({ input: z.prompt + z.view * readers, output: 400 }),
  rerank: (z, readers) => ({ input: z.prompt + z.view * readers, output: 400 }),
  check: (z) => ({ input: z.prompt + z.view, output: 500 }),
  cut: (z) => ({ input: z.prompt + z.view, output: 500 }),
  'tells-sweep': (z) => ({ input: z.prompt + TELLS_CATALOG_TOKENS + z.view, output: 1000 }),
  'tells-compare': (z) => ({ input: z.prompt + 2 * z.view, output: 200 }),
  vision: (z) => ({ input: z.prompt + z.view, output: 1000 }),
  dedupe: (z, readers) => ({ input: z.prompt + z.art * readers, output: 400 }),
  overlap: (z, readers) => ({ input: z.prompt + z.art * (readers + 3), output: 600 }),
  relay: (z) => ({ input: z.prompt + z.art, output: 300 }),
};

/** Token counts vary with the problem: the low end assumes 25% fewer, the high end 50% more. */
export const TOKEN_BAND = { low: 0.75, high: 1.5 } as const;

/** Storyboards run three to six shots (03 C5: chains of 3–4 segments; a few more shots for frames). */
export const STORYBOARD_SHOTS = { low: 3, high: 6 } as const;
/** Requested clip length per relay link, in seconds, before the video model rounds it to a length it makes. */
export const CLIP_SECONDS = { low: 5, high: 10 } as const;
/** Image slots when an ASSET step names none (01 ASSET: up to 3). `triesPerSlot` is not counted: v1 makes one image per brief. */
const DEFAULT_SLOTS = 3;
const IMAGE_PROMPT_TOKENS = 300;

/** Minutes a person spends at each kind of checkpoint (spec §3.2 "Human checkpoint kinds by role"). */
export const HUMAN_MINUTES = {
  pick: [1, 3],
  react: [3, 10],
  directive: [3, 10],
  compare: [2, 5],
  /** VOICE over every line of the work. */
  write: [10, 30],
  /** VOICE-lite: the key lines only (C4). */
  'write-key-lines': [5, 15],
  /** The author's own draft or revision (C3 "own draft", C6, C6a), per round. */
  author: [15, 60],
  confirm: [0.5, 1],
  choose: [0.5, 1],
  /** Which cliché-sweep finds to swap, decided one by one before the swap step (convention C2). */
  select: [1, 3],
} as const satisfies Record<string, readonly [number, number]>;

// ---- Tallies ----------------------------------------------------------------------------------------------------

interface Tally {
  calls: number;
  usd: number;
  images: number;
  clips: number;
  minutes: number;
}
interface Span {
  low: Tally;
  high: Tally;
}
interface Count {
  low: number;
  high: number;
}

const ZERO: Tally = { calls: 0, usd: 0, images: 0, clips: 0, minutes: 0 };
const NONE: Span = { low: ZERO, high: ZERO };
const KEYS = ['calls', 'usd', 'images', 'clips', 'minutes'] as const;

const zip = (a: Tally, b: Tally, f: (x: number, y: number) => number): Tally =>
  Object.fromEntries(KEYS.map((k) => [k, f(a[k], b[k])])) as unknown as Tally;
const scaleTally = (t: Tally, n: number): Tally => zip(t, t, (x) => x * n);
const add = (...spans: Span[]): Span => spans.reduce((s, x) => ({ low: zip(s.low, x.low, (a, b) => a + b), high: zip(s.high, x.high, (a, b) => a + b) }), NONE);
const times = (s: Span, n: Count): Span => ({ low: scaleTally(s.low, n.low), high: scaleTally(s.high, n.high) });
/** Only in the worst case (a cap reached, a retry, an optional taken). */
const onlyHigh = (s: Span): Span => ({ low: ZERO, high: s.high });
/** One of several alternatives: the cheapest at the low end, the dearest at the high end, field by field. */
const either = (spans: Span[]): Span =>
  spans.length === 0
    ? NONE
    : {
        low: spans.map((s) => s.low).reduce((a, b) => zip(a, b, Math.min)),
        high: spans.map((s) => s.high).reduce((a, b) => zip(a, b, Math.max)),
      };
const minutes = (kind: keyof typeof HUMAN_MINUTES): Span => {
  const [low, high] = HUMAN_MINUTES[kind];
  return { low: { ...ZERO, minutes: low }, high: { ...ZERO, minutes: high } };
};

// ---- The walk ---------------------------------------------------------------------------------------------------

/** Prices resolved once per estimate. */
interface Priced {
  medium: Medium;
  tier(t: Tier): PriceRow;
  /** The other-family critic's price, when it is usable (C3). */
  otherFamily?: PriceRow;
  image?: PriceRow;
  video?: { row: PriceRow; model: string; extraUsd: number };
}

interface Question {
  asks: QuestionEstimate['asks'];
  span: Span;
}

interface Walk {
  priced: Priced;
  /** The tokens of the person's problem as a prompt that shows it carries it (PricingContext `problem`). */
  problemTokens?: number;
  /** The size of the work already made (PricingContext `workTokens`). */
  workTokens?: number;
  /** Stage spans without gate retries, for a one-shot gate's "re-run stage Dk". */
  stageBase?: Map<Stage['stage'], Span>;
  /** The recipe's stages in order, and the one being walked: a retry re-runs the stages from its target through this. */
  order?: readonly Stage['stage'][];
  stage?: Stage['stage'];
  /** Each stage's `over` (Walked), for a retry that re-runs it. */
  stageOver?: Map<Stage['stage'], number>;
  /** The most one call priced since walkNode last reset it reserves over its planned cost (completion sets it). */
  callOver?: number;
  /** When set, what each question that commits money commits to, by the node's id (estimateQuestions). */
  questions?: Map<string, Question>;
  /** With `questions`: each gate's "Use it anyway?", to which the walk adds what follows the gate as it reaches it. */
  gates?: Question[];
  /**
   * Inside a relay chain: whether the view its judges see shows no clip. A link makes its clip only when the profile
   * can make video and the chain has a frame to start from, which only an image model makes (relay.ts: otherwise the
   * link finishes skipped). A view rendered in a link with no clip has nothing to judge: its check or critic is not
   * asked, and a loop it reports to ends after its first round, with no cap question (F10, interpreter.ts).
   */
  link?: { blind: boolean };
}

const count = (low: number, high: number): Count => ({ low: Math.max(0, low), high: Math.max(0, high) });

/** The sizes a call of this step is planned from: the problem where its prompt shows it, the work where it is known. */
function sizes(w: Walk, step: Step | undefined): CallSizes {
  const m = w.priced.medium;
  const shown = step !== undefined && w.problemTokens !== undefined && promptShows(step, 'intent', m);
  const work = w.workTokens;
  return {
    prompt: shown ? Math.max(PROMPT_TOKENS, INSTRUCTION_TOKENS + w.problemTokens!) : PROMPT_TOKENS,
    art: work ?? ARTIFACT_TOKENS[m],
    view: work !== undefined && MEDIUM_FORMAT[m].view === 'text' ? work : VIEW_TOKENS[m],
  };
}

/** One call of `role` asked by `step`, whose prompt says whether it shows the problem (none for a helper's own call). */
function completion(w: Walk, role: string, tier: Tier, readers: Count, step: Step | undefined, model?: PriceRow): Span {
  const rule = TOKEN_ASSUMPTIONS[role] ?? TOKEN_ASSUMPTIONS.build!;
  const price = model ?? w.priced.tier(tier);
  const z = sizes(w, step);
  const usd = (readersN: number, band: number) => {
    const t = rule(z, Math.max(1, readersN));
    return tokenCost(price, { inputTokens: Math.ceil(t.input * band), outputTokens: Math.ceil(t.output * band) });
  };
  const high = usd(readers.high, TOKEN_BAND.high);
  // The gateway reserves a call at its whole output allowance before sending it (maxCompletionCost), far above what it
  // plans to cost: what the call holds over that, for the walk's in-flight figure (B-148).
  const input = Math.ceil(rule(z, Math.max(1, readers.high)).input * TOKEN_BAND.high);
  w.callOver = Math.max(w.callOver ?? 0, maxCompletionCost(price, input, outputAllowance(role)) - high);
  return {
    low: { ...ZERO, calls: 1, usd: usd(readers.low, TOKEN_BAND.low) },
    high: { ...ZERO, calls: 1, usd: high },
  };
}

/** Roles whose calls write the work: the runner leaves them the gateway's default output allowance. */
const WRITING_ROLES = new Set(['build', 'seed', 'fix', 'voice', 'asset.integrate']);

/**
 * The output allowance the runner asks a call of this role for, which the gateway reserves it at: 16,000 tokens for a
 * call that writes the work (model-step.ts BUILDERS; asset.integrate), 4,000 for the rest (JUDGE_MAX_OUTPUT; the image
 * briefs, relay links and the cap's re-rank). The runner's model-step test holds it to modelStep's rule.
 */
export const outputAllowance = (role: string): number => (WRITING_ROLES.has(role) ? 16_000 : 4_000);

function images(w: Walk, n: Count): Span {
  const row = w.priced.image;
  if (!row) return NONE;
  const each = (row.perImageUsd ?? 0) + tokenCost(row, { inputTokens: IMAGE_PROMPT_TOKENS, outputTokens: row.estimatedOutputTokensPerImage ?? 0 });
  return { low: { ...ZERO, images: n.low, usd: each * n.low }, high: { ...ZERO, images: n.high, usd: each * n.high } };
}

/** One relay clip through Gateway.video (ADR-0069): the model's seconds at its per-second price, plus its frame extractions. */
function clip(w: Walk): Span {
  const v = w.priced.video;
  if (!v) return NONE;
  const usd = (sec: number) => (v.row.perSecondUsd ?? 0) * falVideoSeconds(v.model, sec) + v.extraUsd;
  return { low: { ...ZERO, clips: 1, usd: usd(CLIP_SECONDS.low) }, high: { ...ZERO, clips: 1, usd: usd(CLIP_SECONDS.high) } };
}

/** Whether a relay link makes its clip: a usable video model, and a frame to start from, which only an image model makes. */
const makesClips = (w: Walk): boolean => w.priced.video !== undefined && w.priced.image !== undefined;

/** The tier a model step runs at: its own, else big for a critic or judge and mid for the rest (the runner's modelStep). */
const tierOf = (s: Step): Tier => s.tier ?? (s.role === 'critic' || s.role === 'judge' ? 'big' : 'mid');
const knobNumber = (s: Step, name: string): number | undefined => {
  const v = s.knobs?.[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

/** The most references a GREAT critic takes: the runner's MAX_REFS (critic.ts), held to it by criticPlanBound's test. */
const CRITIC_MAX_REFS = 10;

/**
 * The most a critic's calls can be, as the runner's planCritic plans them with references to spare: the lineup orders a
 * GREAT critic ranks over (its `shuffles` knob, 1 to 4, one call each) and the references it reads (its `refs` knob, at
 * least 3, else up to 10). In OK mode, one call and no references. The runner's critic test holds the two together.
 */
export function criticPlanBound(knobs: Step['knobs']): { calls: number; refs: number } {
  if (knobs?.mode !== 'GREAT') return { calls: 1, refs: 0 };
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const want = num(knobs.refs) ?? 0;
  const shuffles = num(knobs.shuffles);
  return {
    calls: shuffles !== undefined && shuffles > 1 ? Math.min(4, Math.floor(shuffles)) : 1,
    refs: Math.max(GREAT_MIN_REFERENCES, Math.floor(Math.min(want > 0 ? want : CRITIC_MAX_REFS, CRITIC_MAX_REFS))),
  };
}

function stepSpan(w: Walk, s: Step, set: Count): Span {
  const medium = w.priced.medium;
  if (s.actor === 'model') {
    // A judge of a link's view that shows no clip is not asked (interpreter.ts unobservable).
    if (w.link?.blind && (s.role === 'check' || s.role === 'critic')) return NONE;
    switch (s.role) {
      case 'critic': {
        // The low end is ADR-0071's OK fallback: one call over ours alone.
        const plan = criticPlanBound(s.knobs);
        const one = completion(w, 'critic', tierOf(s), count(1, 1 + plan.refs), s, s.knobs?.family === 'other' ? w.priced.otherFamily : undefined);
        return { low: one.low, high: scaleTally(one.high, plan.calls) };
      }
      case 'judge':
      case 'select':
      case 'dedupe':
      case 'overlap':
        return completion(w, s.role, tierOf(s), set, s);
      case 'relay':
        // relay:media, then Gateway.video for the clip; a link that cannot make its clip finishes skipped, with no call.
        return makesClips(w) ? add(completion(w, 'relay', tierOf(s), count(1, 1), s), clip(w)) : NONE;
      case 'asset': {
        // A step that turns the locked script into audio has no v1 executor (ADR-0069): it finishes skipped.
        if (audioAsset(s)) return NONE;
        // With no image model the runner skips the whole step, its briefs and integrate calls included (asset.ts).
        if (!w.priced.image) return NONE;
        const slots = knobNumber(s, 'slots') ?? DEFAULT_SLOTS;
        const n = medium === 'media' ? count(STORYBOARD_SHOTS.low, STORYBOARD_SHOTS.high) : count(1, slots);
        const integrate = medium === 'web-page' || medium === 'prose' ? completion(w, 'asset.integrate', 'mid', count(1, 1), undefined) : NONE;
        return add(completion(w, 'asset.briefs', tierOf(s), count(1, 1), s), images(w, n), integrate);
      }
      default:
        return completion(w, s.role, tierOf(s), count(1, 1), s);
    }
  }
  if (s.actor === 'human') {
    switch (s.role) {
      case 'vision':
        return minutes('react');
      case 'cut':
        return minutes('directive');
      case 'tells-compare':
        return minutes('compare');
      case 'voice':
        // Your time only: VOICE writes the edited copy back with no model call (ADR-0081, spec §3.2). Until B1 this also
        // counted a mid-tier voice.apply completion for each VOICE that changes the work (that helper is now retired).
        return minutes(s.knobs?.scope === 'key-lines' ? 'write-key-lines' : 'write');
      case 'build':
        return minutes('author');
      default:
        return minutes('confirm');
    }
  }
  // Tools (renders; the C5 matte, which v1 skips) and policies cost no model calls and no human time. A render inside a
  // relay link shows that link's shot, with its clip only when the link made one.
  if (s.actor === 'tool' && s.role === 'render' && w.link) w.link.blind = !makesClips(w);
  return NONE;
}

/**
 * The loop's extra work at its cap: "Use the best version so far?" and a fresh re-rank of the best snapshots for a critic
 * loop. A person's loop asks its cap question in place of the last "Is this ready?", so it adds nothing here.
 */
function atCap(w: Walk, gate: Gate): Span {
  const parts: Span[] = [];
  if (gate.metric !== 'human' && gate.onCap === 'human') parts.push(minutes('confirm'));
  if (gate.metric === 'critic-score' || gate.metric === 'critic-rank') parts.push(completion(w, 'rerank', 'big', count(2, 3), undefined));
  return onlyHigh(add(...parts));
}

interface Walked {
  span: Span;
  set: Count;
  /**
   * The most the node holds of the budget at once, at the high end: what it has spent and what its calls in flight
   * reserve (B-148). Branches of a replicate, an each or an audit run at once (interpreter.ts Promise.all), so their
   * holds add; anything else runs one step at a time.
   */
  hold: number;
  /** The most its calls in flight at once reserve over their planned cost. */
  over: number;
}

/** A seq's spans in order, after each child how many of them it and those before it gave, and its hold and over. */
function walkSeq(w: Walk, n: Seq, set: Count): { spans: Span[]; ends: number[]; set: Count; hold: number; over: number } {
  let cur = set;
  const spans: Span[] = [];
  const marks: Mark[] = [];
  let spent = 0;
  let hold = 0;
  let over = 0;
  n.steps.forEach((c, i) => {
    const from = w.gates?.length ?? 0;
    const r = walkNode(w, c, cur);
    spans.push(r.span);
    cur = r.set;
    // One child at a time: what those before it spent, and what it holds.
    hold = Math.max(hold, spent + r.hold);
    over = Math.max(over, r.over);
    spent += r.span.high.usd;
    // A cliché sweep whose finds feed a swap step: you choose which to swap before it runs (convention C2), exactly
    // where the interpreter asks (asksSwaps reads the steps after it in this seq).
    if (asksSwaps(c, n.steps.slice(i + 1))) spans.push(minutes('select'));
    marks.push({ from, to: w.gates?.length ?? 0, at: spans.length });
  });
  follow(w, marks, spans);
  return { spans, ends: marks.map((m) => m.at), set: cur, hold, over };
}

/**
 * A critic or check loop's round, split after its last child that is or holds an exit point: the gate is applied right
 * after the critic or check, so the round that ends the loop runs the head and not the tail (the fix after it).
 */
function loopRound(w: Walk, n: Loop, set: Count): { head: Span; tail: Span; set: Count; over: number } {
  if (n.gate.metric !== 'human' && n.body.op === 'seq') {
    const r = walkSeq(w, n.body, set);
    const k = n.body.steps.findLastIndex((c) => exitPoints({ ...n, body: c }).length > 0);
    const cut = k < 0 ? r.spans.length : r.ends[k]!;
    return { head: add(...r.spans.slice(0, cut)), tail: add(...r.spans.slice(cut)), set: r.set, over: r.over };
  }
  const body = walkNode(w, n.body, set);
  return { head: body.span, tail: NONE, set: body.set, over: body.over };
}

/** A retry re-runs the stages from its target through the gate's own (interpreter.ts runStages; limits.ts counts the same). */
function retried(w: Walk, target: Stage['stage']): Span | undefined {
  if (!w.stageBase || !w.order || !w.stage) return undefined;
  const from = w.order.indexOf(target);
  const to = w.order.indexOf(w.stage);
  if (from < 0 || from > to) return undefined;
  return add(...w.order.slice(from, to + 1).map((s) => w.stageBase!.get(s) ?? NONE));
}

/**
 * One node's walk. The calls a node asks itself (a step's, a judging pick's, a loop's re-rank) are made one at a time,
 * so it holds what it spent and the most one of them reserves over its planned cost.
 */
function walkNode(w: Walk, n: Node, set: Count): Walked {
  const outer = w.callOver;
  w.callOver = 0;
  const r = walkOp(w, n, set);
  const own = w.callOver;
  w.callOver = outer;
  return { ...r, hold: Math.max(r.hold, r.span.high.usd + own), over: Math.max(r.over, own) };
}

/** What a node holds when it runs one thing after another and its calls in flight reserve `over` at most. */
const inTurn = (span: Span, set: Count, over: number): Walked => ({ span, set, hold: span.high.usd + over, over });

function walkOp(w: Walk, n: Node, set: Count): Walked {
  switch (n.op) {
    case 'step':
      return inTurn(stepSpan(w, n, set), n.role === 'dedupe' ? count(Math.ceil(set.low / 2), set.high) : set, 0);
    case 'seq': {
      const r = walkSeq(w, n, set);
      return { span: add(...r.spans), set: r.set, hold: r.hold, over: r.over };
    }
    case 'replicate': {
      const reps = count(n.n, n.n);
      const body = walkNode(w, n.body, count(1, 1));
      return { span: times(body.span, reps), set: reps, hold: n.n * body.hold, over: n.n * body.over };
    }
    case 'each': {
      const body = walkNode(w, n.body, count(1, 1));
      return { span: times(body.span, set), set, hold: set.high * body.hold, over: set.high * body.over };
    }
    case 'pick': {
      const after = count(Math.min(n.k, set.low), Math.min(n.k, set.high));
      if (n.mode === 'H') return inTurn(minutes('pick'), after, 0);
      if (n.mode === 'C') return inTurn(n.judge ? completion(w, n.judge.role, tierOf(n.judge), set, n.judge) : completion(w, 'judge', 'big', set, undefined), after, 0);
      return inTurn(NONE, after, 0);
    }
    case 'loop': {
      const round = loopRound(w, n, set);
      const body = inTurn(add(round.head, round.tail), round.set, round.over);
      // In a relay link that made no clip, the judge it reports to is not asked: the loop ends after one round, unchecked.
      if (w.link?.blind && exitPoints(n).length) return body;
      // A critic or check loop asks "Use the best version so far?" at its cap (No buys more rounds), and a scored one
      // may ask whether to keep going when the critique is not improving the work (Yes buys more): each further round.
      const scored = n.gate.metric === 'critic-score' || n.gate.metric === 'critic-rank';
      if (n.gate.metric !== 'human' && (n.gate.onCap === 'human' || (scored && n.gate.onNoConverge === 'recalibrate-human'))) w.questions?.set(n.id, { asks: 'cap', span: body.span });
      // The planned rounds. At the cap a person may allow as many again, once (ADR-0073, ADR-0093): their choice, made
      // when they are asked, so the estimate does not count it.
      // A loop can end at its first round (a passing score, "No defects.", your "ready"), so the low end is one round.
      const planned = loopRounds(n.gate).planned;
      const rounds = count(Math.min(1, planned), planned);
      // A loop a person ends asks one question a round: "Is this ready?", and at the last round the cap's question.
      // No to either runs another round of the body.
      if (n.gate.metric === 'human') w.questions?.set(n.id, { asks: 'round', span: body.span });
      const head = n.gate.metric === 'human' ? add(round.head, minutes('confirm')) : round.head;
      // The round that ends the loop (the first at the low end, the cap's at the high end) stops before the tail.
      const span = add(times(head, rounds), times(round.tail, count(rounds.low - 1, rounds.high - 1)), atCap(w, n.gate));
      return inTurn(span, body.set, round.over);
    }
    case 'optional': {
      // The trigger is asked as a yes/no question either way; the body runs only on a yes.
      const body = walkNode(w, n.body, set);
      w.questions?.set(n.id, { asks: 'optional', span: body.span });
      return { span: add(minutes('confirm'), onlyHigh(body.span)), set: count(Math.min(set.low, body.set.low), Math.max(set.high, body.set.high)), hold: body.hold, over: body.over };
    }
    case 'route': {
      const branches = n.branches.map((b) => walkNode(w, b.body, set));
      // Without a choice made up front, the run asks which way to go.
      const ask = onlyHigh(minutes('choose'));
      return {
        span: add(ask, either(branches.map((b) => b.span))),
        set: count(Math.min(...branches.map((b) => b.set.low)), Math.max(...branches.map((b) => b.set.high))),
        hold: Math.max(...branches.map((b) => b.hold)),
        over: Math.max(...branches.map((b) => b.over)),
      };
    }
    case 'audit': {
      const lenses = n.lenses.map((l) => walkNode(w, l.body, set));
      const sum = (f: (l: Walked) => number) => lenses.reduce((a, l) => a + f(l), 0);
      return { span: add(...lenses.map((l) => l.span)), set, hold: sum((l) => l.hold), over: sum((l) => l.over) };
    }
    case 'gate': {
      const body = walkNode(w, n.body, set);
      const retries = n.retry?.times ?? 0;
      // On a fail: re-run the stages from the named one through this gate's, check included, up to `times`; then a
      // person decides. The first walk, which finds the stage spans, leaves the re-runs out, so they are without
      // retries, but keeps the question: a stage another gate re-runs can ask it again.
      const again = n.retry && w.stageBase ? times(retried(w, n.retry.stage) ?? body.span, count(retries, retries)) : NONE;
      const retry = onlyHigh(add(again, minutes('confirm')));
      // Then "Use it anyway?": Yes goes on with the run, so its figure is what follows the gate (follow adds it).
      if (w.questions && w.gates) {
        const q: Question = { asks: 'gate', span: NONE };
        w.questions.set(n.id, q);
        w.gates.push(q);
      }
      // A retry re-runs its stages one after another, so it holds no more over than the most of theirs.
      const rerun = n.retry && w.order && w.stage ? w.order.slice(Math.max(0, w.order.indexOf(n.retry.stage)), w.order.indexOf(w.stage) + 1) : [];
      return inTurn(add(body.span, retry), body.set, Math.max(body.over, ...rerun.map((s) => w.stageOver?.get(s) ?? 0)));
    }
    case 'relay': {
      const links = count(Math.min(STORYBOARD_SHOTS.low, n.maxLinks), n.maxLinks);
      const link = walkNode({ ...w, link: { blind: false } }, n.body, set);
      return inTurn(times(link.span, links), set, link.over);
    }
  }
}

/** Where a child's walk began and ended in the gates' list, and how many of its parent's spans it and those before it gave. */
interface Mark {
  from: number;
  to: number;
  at: number;
}

/**
 * What follows each gate a child reached: the spans after that child's. A gate inside a draft is followed by the rest of
 * that draft, as an optional's figure is for that draft.
 */
function follow(w: Walk, marks: readonly Mark[], spans: readonly Span[]): void {
  if (!w.gates) return;
  for (const m of marks) for (const q of w.gates.slice(m.from, m.to)) q.span = add(q.span, ...spans.slice(m.at));
}

function walkStages(w: Walk, recipe: Recipe): { total: Span; byStage: Map<Stage['stage'], Span>; overByStage: Map<Stage['stage'], number>; hold: number } {
  const byStage = new Map<Stage['stage'], Span>();
  const overByStage = new Map<Stage['stage'], number>();
  let set = count(1, 1);
  const spans: Span[] = [];
  const marks: Mark[] = [];
  const order = recipe.stages.map((s) => s.stage);
  let spent = 0;
  let hold = 0;
  for (const s of recipe.stages) {
    const from = w.gates?.length ?? 0;
    const r = walkNode({ ...w, order, stage: s.stage }, s.body, set);
    byStage.set(s.stage, r.span);
    overByStage.set(s.stage, r.over);
    hold = Math.max(hold, spent + r.hold);
    spent += r.span.high.usd;
    spans.push(r.span);
    set = r.set;
    marks.push({ from, to: w.gates?.length ?? 0, at: spans.length });
  }
  follow(w, marks, spans);
  return { total: add(...spans), byStage, overByStage, hold };
}

function price(rows: readonly PriceRow[], provider: ModelProfile['tiers']['big']['provider'], model: string, at: Date): PriceRow {
  const row = priceFor(rows, provider, model, at);
  if (!row) throw new AdvisorError('unknown-profile', `There is no price for ${provider} model ${model}, so no estimate can be made.`);
  return row;
}

function resolvePrices(recipe: Recipe, ctx: PricingContext): Priced {
  const rows = ctx.prices ?? PRICES;
  const tiers = { big: price(rows, ctx.profile.tiers.big.provider, ctx.profile.tiers.big.model, ctx.at), mid: price(rows, ctx.profile.tiers.mid.provider, ctx.profile.tiers.mid.model, ctx.at) };
  const priced: Priced = { medium: recipe.medium ?? 'prose', tier: (t) => tiers[t] };
  const other = ctx.profile.otherFamily;
  if (ctx.otherFamily && other) priced.otherFamily = price(rows, other.provider, other.model, ctx.at);
  if (ctx.images && ctx.profile.image) priced.image = price(rows, ctx.profile.image.provider, ctx.profile.image.model, ctx.at);
  const video = ctx.profile.video;
  if (ctx.video && video) {
    // fal's frame extractions (the last frame, and the middle frame for the shot check: F10 (a)), at the gateway's bound.
    const extras = video.provider === 'fal' ? FAL_VIDEO_EXTRAS : [];
    const extraUsd = extras.reduce((usd, x) => usd + (priceFor(rows, 'fal', x.model, ctx.at)?.perSecondUsd ?? 0) * x.seconds, 0);
    priced.video = { row: price(rows, video.provider, video.model, ctx.at), model: video.model, extraUsd };
  }
  return priced;
}

const floorCents = (usd: number) => Math.floor(usd * 100 + 1e-9) / 100;
const ceilCents = (usd: number) => Math.ceil(usd * 100 - 1e-9) / 100;

/** A span as an estimate: dollars rounded outward to the cent, minutes to whole minutes. */
function estimateOf(span: Span): CostEstimate {
  return {
    lowUsd: floorCents(span.low.usd),
    highUsd: Math.max(floorCents(span.low.usd), ceilCents(span.high.usd)),
    modelCalls: { low: span.low.calls, high: Math.max(span.low.calls, span.high.calls) },
    images: { low: span.low.images, high: Math.max(span.low.images, span.high.images) },
    clips: { low: span.low.clips, high: Math.max(span.low.clips, span.high.clips) },
    humanMinutes: { low: Math.floor(span.low.minutes), high: Math.max(Math.floor(span.low.minutes), Math.ceil(span.high.minutes)) },
  };
}

/** A walk's prices and the sizes known to it. */
function walkOf(recipe: Recipe, ctx: PricingContext): Walk {
  return {
    priced: resolvePrices(recipe, ctx),
    ...(ctx.problem ? { problemTokens: textTokens(problemSlot(ctx.problem)) } : {}),
    ...(ctx.workTokens !== undefined ? { workTokens: ctx.workTokens } : {}),
  };
}

/** Estimate one run of a recipe with a profile: dollars rounded outward to the cent, minutes to whole minutes. */
export function estimateRecipe(recipe: Recipe, ctx: PricingContext): CostEstimate {
  const w = walkOf(recipe, ctx);
  const base = walkStages(w, recipe);
  const { total, hold } = walkStages({ ...w, stageBase: base.byStage, stageOver: base.overByStage }, recipe);
  return { ...estimateOf(total), holdUsd: ceilCents(Math.max(hold, total.high.usd)) };
}

/**
 * What one answer to a run's question commits to (UX-4 remainder), for the Run screen to show beside the question:
 * - `optional`: "Run this step?"; Yes runs the optional's body once (inside a draft, for that draft);
 * - `round`: a person's loop, "Is this ready?" or its cap's question; No runs one more round of its body;
 * - `cap`: a critic or check loop, "Use the best version so far?" at its cap (No allows more rounds) or "The outside
 *   critique is not improving the work. Keep going anyway?" (Yes goes on): the figure is one further round of its body;
 * - `gate`: a gate that failed, "It did not pass the final check, even after another try. Use it anyway?" when it has a
 *   retry, or "It did not pass the final check. Use it anyway?" when it has none; Yes goes on with the run: what follows
 *   the gate in its stage and the stages after it.
 */
export interface QuestionEstimate {
  asks: 'optional' | 'round' | 'cap' | 'gate';
  estimate: CostEstimate;
}

/**
 * The estimate of each question that commits money, by the node's id, which is the stepId its checkpoints carry. Taken
 * from the same walk as estimateRecipe's, so a question's figure is priced, banded and rounded as the recipe's estimate
 * is, and an optional's figure is what that estimate's high end counts each time it is asked. With `workTokens` (the
 * work beside the question) a figure is sized by that work rather than by the planning sizes.
 */
export function estimateQuestions(recipe: Recipe, ctx: PricingContext): Record<string, QuestionEstimate> {
  const w = walkOf(recipe, ctx);
  const base = walkStages(w, recipe);
  const questions = new Map<string, Question>();
  walkStages({ ...w, stageBase: base.byStage, questions, gates: [] }, recipe);
  return Object.fromEntries([...questions].map(([id, q]) => [id, { asks: q.asks, estimate: estimateOf(q.span) }]));
}
