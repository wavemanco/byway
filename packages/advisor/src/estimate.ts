import type { CostEstimate, Medium, ModelProfile, Tier } from '@byway/contracts';
import { EXTRACT_FRAME_SECONDS_BOUND, FAL_EXTRACT_FRAME, PRICES, falVideoSeconds, priceFor, tokenCost, type PriceRow } from '@byway/gateway';
import { asksSwaps, audioAsset, loopRounds, type Gate, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';
import { AdvisorError } from './errors.ts';

/**
 * Cost estimates (product spec §4 "Estimates"): a structural walk of the recipe — replicate counts, loop probe..max
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
}

/**
 * Typical tokens per call, by role or helper (input, output), for an artifact of `ARTIFACT_TOKENS` and a view of
 * `VIEW_TOKENS`. They are planning numbers, written down so they can be checked against the ledger:
 * - every prompt carries about 1,500 tokens of instructions, the problem and the brief (`PROMPT_TOKENS`);
 * - writers (build, seed) produce one artifact; revisers (fix, voice.apply, asset.integrate) read one and a critique
 *   and produce one;
 * - readers of the work (critic, check, cut, tells, vision, dedupe, overlap) read its view and answer briefly; the TELLS
 *   sweep also reads a tell catalog of about 2,500 tokens;
 * - judges read every candidate's view; a GREAT critic reads the references too (low: none, ADR-0071's OK fallback;
 *   high: its `refs` knob);
 * - relay links answer a short clip prompt; ASSET first asks for image briefs.
 */
export const PROMPT_TOKENS = 1500;
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

type TokenRule = (medium: Medium, readers: number) => Tokens;
const art = (m: Medium) => ARTIFACT_TOKENS[m];
const view = (m: Medium) => VIEW_TOKENS[m];

/** Per-role token assumptions; `readers` is how many views the call reads (candidates, or references plus ours). */
export const TOKEN_ASSUMPTIONS: Readonly<Record<string, TokenRule>> = {
  build: (m) => ({ input: PROMPT_TOKENS, output: art(m) }),
  seed: (m) => ({ input: PROMPT_TOKENS, output: art(m) }),
  fix: (m) => ({ input: PROMPT_TOKENS + art(m) + CRITIQUE_TOKENS, output: art(m) }),
  'voice.apply': (m) => ({ input: PROMPT_TOKENS + 2 * art(m), output: art(m) }),
  'asset.integrate': (m) => ({ input: PROMPT_TOKENS + art(m), output: art(m) }),
  'asset.briefs': (m) => ({ input: PROMPT_TOKENS + art(m), output: 600 }),
  critic: (m, readers) => ({ input: PROMPT_TOKENS + view(m) * readers, output: CRITIQUE_TOKENS }),
  judge: (m, readers) => ({ input: PROMPT_TOKENS + view(m) * readers, output: 400 }),
  select: (m, readers) => ({ input: PROMPT_TOKENS + view(m) * readers, output: 400 }),
  rerank: (m, readers) => ({ input: PROMPT_TOKENS + view(m) * readers, output: 400 }),
  check: (m) => ({ input: PROMPT_TOKENS + view(m), output: 500 }),
  cut: (m) => ({ input: PROMPT_TOKENS + view(m), output: 500 }),
  'tells-sweep': (m) => ({ input: PROMPT_TOKENS + TELLS_CATALOG_TOKENS + view(m), output: 1000 }),
  'tells-compare': (m) => ({ input: PROMPT_TOKENS + 2 * view(m), output: 200 }),
  vision: (m) => ({ input: PROMPT_TOKENS + view(m), output: 1000 }),
  dedupe: (m, readers) => ({ input: PROMPT_TOKENS + art(m) * readers, output: 400 }),
  overlap: (m, readers) => ({ input: PROMPT_TOKENS + art(m) * (readers + 3), output: 600 }),
  relay: (m) => ({ input: PROMPT_TOKENS + art(m), output: 300 }),
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

/** Roles that judge rather than make: big tier unless the step says otherwise (default rule 5). */
const JUDGING_ROLES = new Set(['critic', 'judge', 'check', 'cut', 'tells-sweep', 'tells-compare', 'select', 'overlap']);

// ---- Tallies ----------------------------------------------------------------------------------------------------

interface Tally {
  calls: number;
  usd: number;
  images: number;
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

const ZERO: Tally = { calls: 0, usd: 0, images: 0, minutes: 0 };
const NONE: Span = { low: ZERO, high: ZERO };
const KEYS = ['calls', 'usd', 'images', 'minutes'] as const;

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

interface Walk {
  priced: Priced;
  /** Stage spans without gate retries, for a one-shot gate's "re-run stage Dk". */
  stageBase?: Map<Stage['stage'], Span>;
}

const count = (low: number, high: number): Count => ({ low: Math.max(0, low), high: Math.max(0, high) });

function completion(w: Walk, role: string, tier: Tier, readers: Count, model?: PriceRow): Span {
  const rule = TOKEN_ASSUMPTIONS[role] ?? TOKEN_ASSUMPTIONS.build!;
  const price = model ?? w.priced.tier(tier);
  const usd = (readersN: number, band: number) => {
    const t = rule(w.priced.medium, Math.max(1, readersN));
    return tokenCost(price, { inputTokens: Math.ceil(t.input * band), outputTokens: Math.ceil(t.output * band) });
  };
  return {
    low: { ...ZERO, calls: 1, usd: usd(readers.low, TOKEN_BAND.low) },
    high: { ...ZERO, calls: 1, usd: usd(readers.high, TOKEN_BAND.high) },
  };
}

function images(w: Walk, n: Count): Span {
  const row = w.priced.image;
  if (!row) return NONE;
  const each = (row.perImageUsd ?? 0) + tokenCost(row, { inputTokens: IMAGE_PROMPT_TOKENS, outputTokens: row.estimatedOutputTokensPerImage ?? 0 });
  return { low: { ...ZERO, images: n.low, usd: each * n.low }, high: { ...ZERO, images: n.high, usd: each * n.high } };
}

/** One relay clip through Gateway.video (ADR-0069): the model's seconds at its per-second price, plus frame extraction. */
function clip(w: Walk): Span {
  const v = w.priced.video;
  if (!v) return NONE;
  const usd = (sec: number) => (v.row.perSecondUsd ?? 0) * falVideoSeconds(v.model, sec) + v.extraUsd;
  return { low: { ...ZERO, usd: usd(CLIP_SECONDS.low) }, high: { ...ZERO, usd: usd(CLIP_SECONDS.high) } };
}

const tierOf = (s: Step): Tier => s.tier ?? (JUDGING_ROLES.has(s.role) ? 'big' : 'mid');
const knobNumber = (s: Step, name: string): number | undefined => {
  const v = s.knobs?.[name];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

/** References a critic reads besides ours: none at the low end (ADR-0071's OK fallback), its `refs` knob at the high end. */
function criticReaders(s: Step): Count {
  const refs = knobNumber(s, 'refs') ?? (s.knobs?.mode === 'GREAT' ? 4 : 0);
  return count(1, 1 + refs);
}

function stepSpan(w: Walk, s: Step, set: Count): Span {
  const medium = w.priced.medium;
  if (s.actor === 'model') {
    switch (s.role) {
      case 'critic':
        return completion(w, 'critic', tierOf(s), criticReaders(s), s.knobs?.family === 'other' ? w.priced.otherFamily : undefined);
      case 'judge':
      case 'select':
      case 'dedupe':
      case 'overlap':
        return completion(w, s.role, tierOf(s), set);
      case 'relay':
        // relay:media, then Gateway.video for the clip when a video model is usable.
        return add(completion(w, 'relay', tierOf(s), count(1, 1)), clip(w));
      case 'asset': {
        // A step that turns the locked script into audio has no v1 executor (ADR-0069): it finishes skipped.
        if (audioAsset(s)) return NONE;
        const slots = knobNumber(s, 'slots') ?? DEFAULT_SLOTS;
        const n = medium === 'media' ? count(STORYBOARD_SHOTS.low, STORYBOARD_SHOTS.high) : count(1, slots);
        const integrate = medium === 'web-page' || medium === 'prose' ? completion(w, 'asset.integrate', 'mid', count(1, 1)) : NONE;
        return add(completion(w, 'asset.briefs', tierOf(s), count(1, 1)), w.priced.image ? images(w, n) : NONE, integrate);
      }
      default:
        return completion(w, s.role, tierOf(s), count(1, 1));
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
      case 'voice': {
        const kind = s.knobs?.scope === 'key-lines' ? 'write-key-lines' : 'write';
        // VOICE writes the edited copy back with no model call (ADR-0081, spec §3.2), yet this still counts one mid-tier
        // voice.apply completion when VOICE changes the work, so VOICE is estimated above what it costs (backlog).
        const apply = s.produces.includes('artifact') ? completion(w, 'voice.apply', 'mid', count(1, 1)) : NONE;
        return add(minutes(kind), apply);
      }
      case 'build':
        return minutes('author');
      default:
        return minutes('confirm');
    }
  }
  // Tools (renders; the C5 matte, which v1 skips) and policies cost no model calls and no human time.
  return NONE;
}

/**
 * The loop's extra work at its cap: "Use the best version so far?" and a fresh re-rank of the best snapshots for a critic
 * loop. A person's loop asks its cap question in place of the last "Is this ready?", so it adds nothing here.
 */
function atCap(w: Walk, gate: Gate): Span {
  const parts: Span[] = [];
  if (gate.metric !== 'human' && gate.onCap === 'human') parts.push(minutes('confirm'));
  if (gate.metric === 'critic-score' || gate.metric === 'critic-rank') parts.push(completion(w, 'rerank', 'big', count(2, 3)));
  return onlyHigh(add(...parts));
}

interface Walked {
  span: Span;
  set: Count;
}

function walkNode(w: Walk, n: Node, set: Count): Walked {
  switch (n.op) {
    case 'step':
      return { span: stepSpan(w, n, set), set: n.role === 'dedupe' ? count(Math.ceil(set.low / 2), set.high) : set };
    case 'seq': {
      let cur = set;
      const spans: Span[] = [];
      n.steps.forEach((c, i) => {
        const r = walkNode(w, c, cur);
        spans.push(r.span);
        cur = r.set;
        // A cliché sweep whose finds feed a swap step: you choose which to swap before it runs (convention C2), exactly
        // where the interpreter asks (asksSwaps reads the steps after it in this seq).
        if (asksSwaps(c, n.steps.slice(i + 1))) spans.push(minutes('select'));
      });
      return { span: add(...spans), set: cur };
    }
    case 'replicate': {
      const reps = count(n.n, n.n);
      return { span: times(walkNode(w, n.body, count(1, 1)).span, reps), set: reps };
    }
    case 'each':
      return { span: times(walkNode(w, n.body, count(1, 1)).span, set), set };
    case 'pick': {
      const after = count(Math.min(n.k, set.low), Math.min(n.k, set.high));
      if (n.mode === 'H') return { span: minutes('pick'), set: after };
      if (n.mode === 'C') return { span: n.judge ? completion(w, n.judge.role, tierOf(n.judge), set) : completion(w, 'judge', 'big', set), set: after };
      return { span: NONE, set: after };
    }
    case 'loop': {
      const body = walkNode(w, n.body, set);
      // The planned rounds. At the cap a person may allow as many again, once (ADR-0073, ADR-0093): their choice, made
      // when they are asked, so the estimate does not count it.
      const planned = loopRounds(n.gate).planned;
      const rounds = count(Math.min(n.gate.probe, planned), planned);
      // A loop a person ends asks one question a round: "Is this ready?", and at the last round the cap's question.
      const perRound = n.gate.metric === 'human' ? add(body.span, minutes('confirm')) : body.span;
      return { span: add(times(perRound, rounds), atCap(w, n.gate)), set: body.set };
    }
    case 'optional': {
      // The trigger is asked as a yes/no question either way; the body runs only on a yes.
      const body = walkNode(w, n.body, set);
      return { span: add(minutes('confirm'), onlyHigh(body.span)), set: count(Math.min(set.low, body.set.low), Math.max(set.high, body.set.high)) };
    }
    case 'route': {
      const branches = n.branches.map((b) => walkNode(w, b.body, set));
      // Without a choice made up front, the run asks which way to go.
      const ask = onlyHigh(minutes('choose'));
      return {
        span: add(ask, either(branches.map((b) => b.span))),
        set: count(Math.min(...branches.map((b) => b.set.low)), Math.max(...branches.map((b) => b.set.high))),
      };
    }
    case 'audit':
      return { span: add(...n.lenses.map((l) => walkNode(w, l.body, set).span)), set };
    case 'gate': {
      const body = walkNode(w, n.body, set);
      const retries = n.retry?.times ?? 0;
      const stage = n.retry ? w.stageBase?.get(n.retry.stage) : undefined;
      // On a fail: re-run the named stage and the check, up to `times`; then a person decides.
      const retry = onlyHigh(add(times(add(stage ?? NONE, body.span), count(retries, retries)), minutes('confirm')));
      return { span: add(body.span, retry), set: body.set };
    }
    case 'relay': {
      const links = count(Math.min(STORYBOARD_SHOTS.low, n.maxLinks), n.maxLinks);
      return { span: times(walkNode(w, n.body, set).span, links), set };
    }
  }
}

function walkStages(w: Walk, recipe: Recipe): { total: Span; byStage: Map<Stage['stage'], Span> } {
  const byStage = new Map<Stage['stage'], Span>();
  let set = count(1, 1);
  const spans: Span[] = [];
  for (const s of recipe.stages) {
    const r = walkNode(w, s.body, set);
    byStage.set(s.stage, r.span);
    spans.push(r.span);
    set = r.set;
  }
  return { total: add(...spans), byStage };
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
    const extract = video.provider === 'fal' ? priceFor(rows, 'fal', FAL_EXTRACT_FRAME, ctx.at) : undefined;
    priced.video = { row: price(rows, video.provider, video.model, ctx.at), model: video.model, extraUsd: (extract?.perSecondUsd ?? 0) * EXTRACT_FRAME_SECONDS_BOUND };
  }
  return priced;
}

const floorCents = (usd: number) => Math.floor(usd * 100 + 1e-9) / 100;
const ceilCents = (usd: number) => Math.ceil(usd * 100 - 1e-9) / 100;

/** Estimate one run of a recipe with a profile: dollars rounded outward to the cent, minutes to whole minutes. */
export function estimateRecipe(recipe: Recipe, ctx: PricingContext): CostEstimate {
  const priced = resolvePrices(recipe, ctx);
  const base = walkStages({ priced }, recipe);
  const { total } = walkStages({ priced, stageBase: base.byStage }, recipe);
  return {
    lowUsd: floorCents(total.low.usd),
    highUsd: Math.max(floorCents(total.low.usd), ceilCents(total.high.usd)),
    modelCalls: { low: total.low.calls, high: Math.max(total.low.calls, total.high.calls) },
    images: { low: total.low.images, high: Math.max(total.low.images, total.high.images) },
    humanMinutes: { low: Math.floor(total.low.minutes), high: Math.max(Math.floor(total.low.minutes), Math.ceil(total.high.minutes)) },
  };
}
