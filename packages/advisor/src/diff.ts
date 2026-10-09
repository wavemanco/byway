import { BLOCK_NAMES, presentedStepFor, STAGE_NAMES } from '@byway/catalog';
import type { Medium, RecipePresentation } from '@byway/contracts';
import type { BlockCode } from '@byway/protocol';
import {
  feedsGate,
  machineWrites,
  projectNode,
  sameRun,
  voiceScope,
  voiceWrite,
  walkNode,
  type Audit,
  type Each,
  type Gate,
  type Json,
  type Loop,
  type Node,
  type OneShotGate,
  type Optional,
  type Pick,
  type Recipe,
  type RelayChain,
  type Replicate,
  type Route,
  type Stage,
  type Step,
  type VoiceScope,
} from '@byway/recipe';
import { stepLabel } from './present.ts';

/**
 * A composed recipe described as a diff from its nearest canonical recipe, in plain words (ADR-0058: "shown as a diff
 * from the nearest canonical one"). It says "The same steps as …" only when the two run the same: their semantic
 * projections (@byway/recipe projection.ts, built from FIELD_ROLES) are equal (F08, ADR-0092 stage 3). Before, it
 * compared a hand-picked subset of fields and called the rest "the same".
 *
 * Every node type is paired (by id, then by what it is, in order), and the changes that matter most to the person
 * are described: who does a step, where it runs (its stage, whether it always runs, a side-by-side review or a final
 * check it sits in, once per draft, behind a check that can end its round, after your words), who picks and how many,
 * how a repeat ends and stops early, the quality bar (described, never quoted: the bar stays hidden from everyone who
 * could game it), what your words cover, when an optional step is offered, and a final check's re-runs. Any other
 * difference reads "Other technical changes that affect how it runs."
 *
 * Plain words by default (spec §5, UX-13): steps, repeats and parallel drafts are named by the labels the person saw
 * (the nearest recipe's presentation where it has the step, else the block or role name), with the stage they run in;
 * node ids and medium codes are never shown. ComposeResult.diff is a list of strings, so ids have nowhere to go that
 * only "Show technical names" would reveal; they stay in the recipe itself.
 */

/** The line for any difference the describers do not name. */
export const OTHER_CHANGES = 'Other technical changes that affect how it runs.';

/** How the gate a step follows can end its round: a defect check, or a review against a quality bar. */
type ExitKind = 'check' | 'review';

/** Where a node sits, as far as it decides whether it runs and whether what it makes is kept. */
interface Where {
  /** Under an optional or a route: a run may skip it. */
  choice: boolean;
  /** In a side-by-side review (an audit lens): it only comments. */
  lens: boolean;
  /** In a one-shot final check's body: it only comments. */
  gateBody: boolean;
  /** A pick's judge. */
  judge: boolean;
  /** Inside replicate or each: once per draft. */
  perCandidate: boolean;
  /** After a step that can end its loop's round, within that loop's body: it runs only when the round goes on. */
  afterExit: ExitKind | undefined;
}

interface Placed<T> {
  node: T;
  stage: Stage['stage'];
  where: Where;
  /** Order in the walk, for seeing a step move. */
  index: number;
  /** A step its loop's gate reads, so its verdict can end the round. */
  feeds: boolean;
  /** How many steps before it in the walk write your words into the work. */
  afterVoice: number;
}

interface Collected {
  steps: Placed<Step>[];
  picks: Placed<Pick>[];
  loops: Placed<Loop>[];
  replicates: Placed<Replicate>[];
  eaches: Placed<Each>[];
  relays: Placed<RelayChain>[];
  optionals: Placed<Optional>[];
  routes: Placed<Route>[];
  audits: Placed<Audit>[];
  gates: Placed<OneShotGate>[];
}

const exitKind = (metric: string): ExitKind => (metric === 'check-clean' ? 'check' : 'review');

function collect(recipe: Recipe): Collected {
  const out: Collected = { steps: [], picks: [], loops: [], replicates: [], eaches: [], relays: [], optionals: [], routes: [], audits: [], gates: [] };
  let index = 0;
  let voiced = 0;
  type Frame = { metric: string; fed: boolean };
  const visit = (n: Node, stage: Stage['stage'], w: Where, loop: Frame | undefined): void => {
    // Inside the loop's body, after a step that can end the round.
    const here: Where = loop?.fed && !w.afterExit ? { ...w, afterExit: exitKind(loop.metric) } : w;
    const placed = <T>(node: T, feeds = false): Placed<T> => ({ node, stage, where: here, index: index++, feeds, afterVoice: voiced });
    switch (n.op) {
      case 'step': {
        const feeds = !!loop && feedsGate(n, loop.metric);
        out.steps.push(placed(n, feeds));
        if (feeds) loop!.fed = true;
        if (voiceWrite(n) && !here.lens && !here.gateBody && !here.judge) voiced++;
        return;
      }
      case 'seq':
        n.steps.forEach((c) => visit(c, stage, here, loop));
        return;
      case 'pick':
        out.picks.push(placed(n));
        if (n.judge) visit(n.judge, stage, { ...here, judge: true }, undefined);
        return;
      case 'loop':
        out.loops.push(placed(n));
        visit(n.body, stage, here, { metric: n.gate.metric, fed: false });
        return;
      case 'replicate':
        out.replicates.push(placed(n));
        visit(n.body, stage, { ...here, perCandidate: true }, undefined);
        return;
      case 'each':
        out.eaches.push(placed(n));
        visit(n.body, stage, { ...here, perCandidate: true }, undefined);
        return;
      case 'relay':
        out.relays.push(placed(n));
        visit(n.body, stage, here, loop);
        return;
      case 'optional':
        out.optionals.push(placed(n));
        visit(n.body, stage, { ...here, choice: true }, loop);
        return;
      case 'route':
        out.routes.push(placed(n));
        n.branches.forEach((b) => visit(b.body, stage, { ...here, choice: true }, loop));
        return;
      case 'audit':
        out.audits.push(placed(n));
        n.lenses.forEach((l) => visit(l.body, stage, { ...here, lens: true }, undefined));
        return;
      case 'gate':
        out.gates.push(placed(n));
        visit(n.body, stage, { ...here, gateBody: true }, undefined);
        return;
    }
  };
  const top: Where = { choice: false, lens: false, gateBody: false, judge: false, perCandidate: false, afterExit: undefined };
  recipe.stages.forEach((s) => visit(s.body, s.stage, top, undefined));
  return out;
}

type WithId = { id: string };

/** Pair items by id, then by signature in order. Returns the pairs and what is left on each side. */
function pair<T extends WithId>(before: Placed<T>[], after: Placed<T>[], ...signatures: ((n: Placed<T>) => string)[]): { pairs: [Placed<T>, Placed<T>][]; removed: Placed<T>[]; added: Placed<T>[] } {
  const left = [...before];
  const right = [...after];
  const pairs: [Placed<T>, Placed<T>][] = [];
  const matchers = [(a: Placed<T>, b: Placed<T>) => a.node.id === b.node.id, ...signatures.map((sig) => (a: Placed<T>, b: Placed<T>) => sig(a) === sig(b))];
  for (const matcher of matchers) {
    for (let i = 0; i < left.length; ) {
      const j = right.findIndex((r) => matcher(left[i]!, r));
      if (j < 0) {
        i++;
        continue;
      }
      pairs.push([left[i]!, right[j]!]);
      left.splice(i, 1);
      right.splice(j, 1);
    }
  }
  return { pairs, removed: left, added: right };
}

const show = (v: Json | undefined): string => (Array.isArray(v) ? v.join(', ') : String(v));

/** "1 round", "2 rounds": counts read as plain English. */
const counted = (n: Json | undefined, noun: string): string => `${show(n)} ${noun}${n === 1 ? '' : 's'}`;

/** One knob change in plain words; the VOICE scope and the critic's mode get their own phrasing. */
function knobChange(name: string, before: Json | undefined, after: Json | undefined): string {
  if (name === 'scope' && after === 'every-line') return 'you write every line instead of the key lines';
  if (name === 'scope' && after === 'key-lines') return 'you write the key lines instead of every line';
  if (name === 'mode' && after === 'OK') return 'scores the work against a quality bar instead of ranking it among examples';
  if (name === 'mode' && after === 'GREAT') return 'ranks the work among examples instead of scoring it against a quality bar';
  if (name === 'refs') return after === undefined ? `no examples to compare with (was ${show(before)})` : `${counted(after, 'example')} to compare with${before === undefined ? '' : ` instead of ${show(before)}`}`;
  if (after === undefined) return `${name} no longer set (was ${show(before)})`;
  if (before === undefined) return `${name} set to ${show(after)}`;
  return `${name} ${show(after)} instead of ${show(before)}`;
}

const WHO: Record<Step['actor'], string> = { human: 'you', model: 'the AI', tool: 'a tool', policy: 'a fixed rule' };

/** What a VOICE write covers, in plain words. */
function scopeWords(s: VoiceScope): string {
  const base = { claims: 'only the claims', script: 'the voice-over script', 'on-screen': 'the on-screen copy', all: 'the reader-facing words' }[s.base];
  return s.keyLines ? `the key lines of ${base.replace(/^only /, '')}` : base;
}

/** Media in plain words, for "Makes … instead of …". */
const MEDIUM_WORDS: Readonly<Record<Medium, string>> = {
  'web-page': 'a web page',
  prose: 'a written document',
  options: 'a set of options',
  media: 'a storyboard and video',
  'code-diff': 'a code change',
};
const mediumWords = (m: Medium | undefined) => (m ? MEDIUM_WORDS[m] : 'an unspecified kind of work');

/** Labels by node id, from the nearest recipe's presentation (what the person saw in the Library). */
type Labels = (id: string) => string | undefined;

/** A step or pick as the person knows it: its shown label, and the stage it runs in. */
const named = (p: Placed<Step | Pick>, labels: Labels) => `${labels(p.node.id) ?? stepLabel(p.node)} (${STAGE_NAMES[p.stage]})`;

/** What a loop or a replicate repeats: the first step in its body that is not a render, as the person knows it. */
function bodyLabel(n: Node, labels: Labels): string {
  let lead: Step | Pick | undefined;
  walkNode(n, '', 'D1', (c) => {
    if (!lead && (c.op === 'pick' || (c.op === 'step' && c.role !== 'render'))) lead = c;
  });
  if (!lead) return 'the work';
  return labels(n.op === 'loop' || n.op === 'replicate' ? n.id : lead.id) ?? labels(lead.id) ?? stepLabel(lead);
}

function loopWords(l: Loop): string {
  switch (l.gate.metric) {
    case 'human':
      return 'until you say it is ready';
    case 'check-clean':
      return 'until the defect check is clean';
    case 'critic-rank':
      return 'until it ranks well enough among examples';
    default:
      return 'until it clears a quality bar';
  }
}

/** A changed quality bar, by which way it moved; never the number. A rank bar is stricter as its number falls. */
function barWords(metric: string, before: number | undefined, after: number | undefined, what: string): string | undefined {
  if (before === after) return undefined;
  if (before === undefined) return `now ${what} at a quality bar`;
  if (after === undefined) return `no longer ${what} at a quality bar`;
  const higher = metric === 'critic-rank' ? after < before : after > before;
  return `${what} at a ${higher ? 'higher' : 'lower'} quality bar`;
}

/** Who makes a pick's choice, now and as it was. */
const PICK_NOW: Record<Pick['mode'], string> = { H: 'you choose', C: 'the AI chooses', R: 'chosen at random, no one compares them' };
const PICK_BEFORE: Record<Pick['mode'], string> = { H: 'you chose', C: 'the AI chose', R: 'it was chosen at random' };

/** The parts of a step the describers name; any other semantic field that differs is an "other technical change". */
const STEP_DESCRIBED = new Set(['actor', 'tier', 'prompt', 'knobs', 'variant']);

/** The semantic fields of a node of its own (children left out), projected. */
function own(n: Node): Record<string, Json> {
  const p = projectNode(n) as Record<string, Json>;
  const { steps: _s, body: _b, judge: _j, ...rest } = p;
  if (n.op === 'audit') return { ...rest, lenses: (p.lenses as Record<string, Json>[]).map((l) => l.name ?? null) };
  if (n.op === 'route') return { ...rest, branches: (p.branches as Record<string, Json>[]).map((b) => b.name ?? null) };
  return rest;
}
const differs = (a: Json | undefined, b: Json | undefined) => JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);

/** Where a step moved, in plain words. */
function placementChanges(a: Placed<Step>, b: Placed<Step>): string[] {
  const out: string[] = [];
  const x = a.where;
  const y = b.where;
  if (a.stage !== b.stage) out.push(`runs in ${STAGE_NAMES[b.stage]} instead of ${STAGE_NAMES[a.stage]}`);
  if (x.choice !== y.choice) out.push(y.choice ? 'now runs only when it applies' : 'now always runs');
  if (x.lens !== y.lens) out.push(y.lens ? 'now one of several reviews side by side, which only comment' : 'no longer one of several reviews side by side');
  if (x.gateBody !== y.gateBody) out.push(y.gateBody ? 'now part of a final check, which only comments' : 'no longer part of a final check');
  if (x.perCandidate !== y.perCandidate) out.push(y.perCandidate ? 'now runs once for each draft' : 'now runs once, not for each draft');
  if (x.afterExit !== y.afterExit) {
    if (y.afterExit === 'check') out.push('now runs only when the check finds problems');
    else if (y.afterExit === 'review') out.push('now runs only when the review does not end the round');
    else out.push('now runs every round');
  }
  if (a.feeds !== b.feeds) out.push(b.feeds ? 'its repeat now stops on its verdict' : 'its repeat no longer stops on its verdict');
  // A writer that now has more (or fewer) of your words before it: they may no longer be the last word on the work.
  if (machineWrites(b.node) && a.afterVoice !== b.afterVoice) out.push(b.afterVoice > a.afterVoice ? 'now runs after your words' : 'now runs before your words');
  return out;
}

/** What changed in a paired step, and whether something changed that no phrase names. */
function stepChanges(a: Placed<Step>, b: Placed<Step>, media: [Medium | undefined, Medium | undefined]): { words: string[]; moved: boolean; other: boolean } {
  const words: string[] = [];
  const x = a.node;
  const y = b.node;
  if (x.actor !== y.actor) words.push(`done by ${WHO[y.actor]} instead of ${WHO[x.actor]}`);
  const moves = placementChanges(a, b);
  words.push(...moves);
  if ((x.tier ?? '') !== (y.tier ?? '') && y.tier) words.push(y.tier === 'big' ? 'uses the bigger model' : 'uses the faster model');
  if ((x.prompt ?? '') !== (y.prompt ?? '')) words.push('uses different instructions');
  const ka = x.knobs ?? {};
  const kb = y.knobs ?? {};
  for (const name of [...new Set([...Object.keys(ka), ...Object.keys(kb)])]) {
    if (JSON.stringify(ka[name]) !== JSON.stringify(kb[name])) words.push(knobChange(name, ka[name], kb[name]));
  }
  // What your words cover: named when the copy itself changed (key lines against every line is the scope knob's).
  let other = false;
  if (voiceWrite(x) && voiceWrite(y)) {
    const sa = voiceScope(x, media[0]);
    const sb = voiceScope(y, media[1]);
    if (sa.base !== sb.base) words.push(`you write ${scopeWords(sb)} instead of ${scopeWords(sa)}`);
  } else if ((x.variant ?? '') !== (y.variant ?? '')) other = true;
  if ((x.tier ?? '') !== (y.tier ?? '') && !y.tier) other = true;
  const ox = own(x);
  const oy = own(y);
  for (const field of new Set([...Object.keys(ox), ...Object.keys(oy)])) if (!STEP_DESCRIBED.has(field) && differs(ox[field], oy[field])) other = true;
  return { words, moved: moves.length > 0, other };
}

/** A paired loop's changes: how it ends and how many rounds (the line read before), then the rest of its gate. */
function loopChanges(a: Loop, b: Loop): { repeats: string[]; more: string[]; other: boolean } {
  const g: Gate = a.gate;
  const h: Gate = b.gate;
  const repeats: string[] = [];
  const more: string[] = [];
  if (g.metric !== h.metric) repeats.push(`${loopWords(b)} instead of ${loopWords(a)}`);
  if (g.max !== h.max) repeats.push(`up to ${counted(h.max, 'round')} instead of ${g.max}`);
  const bar = g.metric === h.metric ? barWords(h.metric, g.threshold, h.threshold, 'stops') : differs(g.threshold, h.threshold) ? 'stops at a different quality bar' : undefined;
  if (bar) more.push(bar);
  if (differs(g.plateau, h.plateau)) {
    if (!h.plateau) more.push('no longer stops early when its scores stop improving');
    else if (!g.plateau) more.push('now stops early when its scores stop improving');
    else more.push('stops early on a different rule when its scores stop improving');
  }
  if (g.probe !== h.probe) more.push(`asks whether it is improving after ${counted(h.probe, 'round')} instead of ${g.probe}`);
  if (g.onNoConverge !== h.onNoConverge) more.push(h.onNoConverge === 'recalibrate-human' ? 'asks you when it is not improving' : 'keeps going when it is not improving, without asking you');
  if (g.onCap !== h.onCap) more.push(h.onCap === 'human' ? 'at its last round, asks you' : 'at its last round, takes its best version without asking you');
  if (g.hidden !== h.hidden) more.push(h.hidden ? 'its quality bar is now hidden' : 'its quality bar is no longer hidden');
  const other = g.holder !== h.holder;
  return { repeats, more, other };
}

/** A paired final check's changes. */
function gateChanges(a: OneShotGate, b: OneShotGate): { words: string[]; other: boolean } {
  const words: string[] = [];
  const bar = a.pass.metric === b.pass.metric ? barWords(b.pass.metric, a.pass.threshold, b.pass.threshold, 'passes') : differs(a.pass.threshold, b.pass.threshold) ? 'passes at a different quality bar' : undefined;
  if (bar) words.push(bar);
  if (a.pass.metric !== b.pass.metric) words.push(b.pass.metric === 'critic-rank' ? 'ranks the work among examples instead of scoring it' : 'scores the work instead of ranking it among examples');
  if (a.retry && !b.retry) words.push('no longer re-runs an earlier stage on a fail');
  else if (!a.retry && b.retry) words.push(`on a fail, re-runs ${STAGE_NAMES[b.retry.stage]} up to ${counted(b.retry.times, 'time')}`);
  else if (a.retry && b.retry) {
    if (a.retry.stage !== b.retry.stage) words.push(`on a fail, re-runs ${STAGE_NAMES[b.retry.stage]} instead of ${STAGE_NAMES[a.retry.stage]}`);
    if (a.retry.times !== b.retry.times) words.push(`re-runs up to ${counted(b.retry.times, 'time')} instead of ${a.retry.times}`);
  }
  if (a.pass.hidden !== b.pass.hidden) words.push(b.pass.hidden ? 'its quality bar is now hidden' : 'its quality bar is no longer hidden');
  const other = a.pass.holder !== b.pass.holder || a.onFail !== b.onFail;
  return { words, other };
}

/** The label of the first step or pick inside a node, as the person knows it. */
function firstLabel(n: Node, labels: Labels): string {
  let lead: Step | Pick | undefined;
  walkNode(n, '', 'D1', (c) => {
    if (!lead && (c.op === 'pick' || (c.op === 'step' && c.role !== 'render'))) lead = c;
  });
  return (lead && (labels(lead.id) ?? stepLabel(lead))) ?? 'the work';
}

/**
 * The composed recipe's differences from its nearest canonical one, one plain line each. `nearestPresentation` names
 * the nearest recipe's steps as the person saw them; without it, steps are named from their block or role.
 */
export function diffFromNearest(composed: Recipe, nearest: Recipe, nearestName: string, nearestPresentation?: RecipePresentation): string[] {
  if (sameRun(composed, nearest)) return [`The same steps as ${nearestName}.`];
  const a = collect(nearest);
  const b = collect(composed);
  const lines: string[] = [];
  let other = false;
  const shown: Labels = (id) => (nearestPresentation ? presentedStepFor(nearestPresentation, id)?.label : undefined);
  // The composed recipe's own steps are named from its blocks and roles: a nearest label could name something else there.
  const own_: Labels = () => undefined;
  const media: [Medium | undefined, Medium | undefined] = [nearest.medium, composed.medium];

  if (composed.medium !== nearest.medium) lines.push(`Makes ${mediumWords(composed.medium)} instead of ${mediumWords(nearest.medium)}.`);

  // Steps. Renders are glue: they follow from the steps that read them, so they are paired but never named.
  const steps = pair(a.steps, b.steps, ({ node: s }) => `${s.role}|${s.block ?? ''}|${s.actor}`);
  const isRender = (p: Placed<Step>) => p.node.role === 'render';
  for (const r of steps.removed) if (!isRender(r)) lines.push(`Removed: ${named(r, shown)}`);
  for (const x of steps.added) if (!isRender(x)) lines.push(`Added: ${named(x, own_)}${x.where.choice ? ', when it applies' : ''}`);
  let moved = false;
  for (const [x, y] of steps.pairs) {
    const c = stepChanges(x, y, media);
    if (isRender(x)) {
      if (c.words.length || c.other) other = true;
      continue;
    }
    if (c.words.length) lines.push(`Changed: ${named({ ...y, node: x.node }, shown)}: ${c.words.join('; ')}`);
    if (c.other) other = true;
    if (c.moved) moved = true;
  }
  // A step that moved without changing anything named above (say, ahead of the step it followed).
  const order = (pairs: [Placed<Step>, Placed<Step>][], side: 0 | 1) => [...pairs].sort((p, q) => p[side].index - q[side].index).map((p) => p[0].node.id);
  if (!moved && JSON.stringify(order(steps.pairs, 0)) !== JSON.stringify(order(steps.pairs, 1))) other = true;

  // Picks: who chooses and how many are kept.
  const picks = pair(a.picks, b.picks, () => 'pick');
  for (const r of picks.removed) lines.push(`Removed: ${named(r, shown)}`);
  for (const x of picks.added) lines.push(`Added: ${named(x, own_)}: ${PICK_NOW[x.node.mode]}`);
  for (const [x, y] of picks.pairs) {
    const words: string[] = [];
    if (x.node.mode !== y.node.mode) words.push(`${PICK_NOW[y.node.mode]}, where ${PICK_BEFORE[x.node.mode]} before`);
    if (x.node.k !== y.node.k) words.push(`keeps ${y.node.k} instead of ${x.node.k}`);
    if (words.length) lines.push(`Changed: ${named({ ...y, node: x.node }, shown)}: ${words.join('; ')}`);
    if (x.node.actor !== y.node.actor && x.node.mode === y.node.mode) other = true;
    if (x.stage !== y.stage || differs(x.where as unknown as Json, y.where as unknown as Json)) other = true;
  }

  // Loops pair by id, then by what ends them, then by stage (a loop that changed how it ends is still that loop).
  const loops = pair(a.loops, b.loops, ({ node: l }) => l.gate.metric, (l) => l.stage);
  for (const r of loops.removed) lines.push(`Removed: repeating ${bodyLabel(r.node, shown)} ${loopWords(r.node)}`);
  for (const x of loops.added) lines.push(`Added: ${bodyLabel(x.node, own_)} repeated up to ${counted(x.node.gate.max, 'round')}, ${loopWords(x.node)}`);
  for (const [x, y] of loops.pairs) {
    const c = loopChanges(x.node, y.node);
    if (c.repeats.length) lines.push(`Changed: ${bodyLabel(x.node, shown)} repeats ${c.repeats.join('; ')}`);
    if (c.more.length) lines.push(`Changed: ${bodyLabel(x.node, shown)} repeats: ${c.more.join('; ')}`);
    if (c.other) other = true;
  }

  const reps = pair(a.replicates, b.replicates, () => 'replicate');
  for (const r of reps.removed) lines.push(`Removed: ${bodyLabel(r.node, shown)}: ${counted(r.node.n, 'separate draft')}`);
  for (const x of reps.added) lines.push(`Added: ${bodyLabel(x.node, own_)}: ${counted(x.node.n, 'separate draft')}`);
  for (const [x, y] of reps.pairs) if (x.node.n !== y.node.n) lines.push(`Changed: ${bodyLabel(x.node, shown)}: ${counted(y.node.n, 'separate draft')} instead of ${x.node.n}`);

  const relays = pair(a.relays, b.relays, () => 'relay');
  for (const _r of relays.removed) lines.push('Removed: the shot-by-shot motion chain');
  for (const x of relays.added) lines.push(`Added: a shot-by-shot motion chain of up to ${counted(x.node.maxLinks, 'shot')}`);
  for (const [x, y] of relays.pairs) if (x.node.maxLinks !== y.node.maxLinks) lines.push(`Changed: the motion chain makes up to ${counted(y.node.maxLinks, 'shot')} instead of ${x.node.maxLinks}`);

  // An optional's question: when it is offered. Optionals, routes and each groups that come or go show in their steps.
  for (const [x, y] of pair(a.optionals, b.optionals, () => 'optional').pairs) {
    if (x.node.trigger !== y.node.trigger) lines.push(`Changed: ${firstLabel(x.node, shown)} (${STAGE_NAMES[x.stage]}): asks to run it when ${y.node.trigger.replace(/[.\s]+$/, '')}, instead of when ${x.node.trigger.replace(/[.\s]+$/, '')}`);
  }
  for (const [x, y] of pair(a.routes, b.routes, () => 'route').pairs) if (differs(own(x.node) as Json, own(y.node) as Json)) other = true;

  // Side-by-side reviews and final checks: their steps only comment, so they are named when they come or go.
  const audits = pair(a.audits, b.audits, () => 'audit');
  for (const r of audits.removed) lines.push(`Removed: the reviews side by side (${STAGE_NAMES[r.stage]})`);
  for (const x of audits.added) lines.push(`Added: ${counted(x.node.lenses.length, 'review')} side by side, which only comment (${STAGE_NAMES[x.stage]})`);
  for (const [x, y] of audits.pairs) if (differs(own(x.node) as Json, own(y.node) as Json)) other = true;

  const gates = pair(a.gates, b.gates, () => 'gate');
  const gateName = (p: Placed<OneShotGate>, labels: Labels) => `${labels(p.node.id) ?? 'Final check'} (${STAGE_NAMES[p.stage]})`;
  for (const r of gates.removed) lines.push(`Removed: ${gateName(r, shown)}`);
  for (const x of gates.added) lines.push(`Added: a final check (${STAGE_NAMES[x.stage]})${x.node.retry ? `, which re-runs ${STAGE_NAMES[x.node.retry.stage]} on a fail` : ''}`);
  for (const [x, y] of gates.pairs) {
    const c = gateChanges(x.node, y.node);
    if (c.words.length) lines.push(`Changed: ${gateName(x, shown)}: ${c.words.join('; ')}`);
    if (c.other || x.stage !== y.stage) other = true;
  }

  const sitting = (r: Recipe) => new Map(r.sitsOut.map((s) => [s.block, s.reason]));
  const outA = sitting(nearest);
  const outB = sitting(composed);
  for (const [block, reason] of outB) if (!outA.has(block)) lines.push(`Leaves out ${BLOCK_NAMES[block as BlockCode]}: ${reason}`);
  for (const block of outA.keys()) if (!outB.has(block)) lines.push(`No longer leaves out ${BLOCK_NAMES[block as BlockCode]}`);
  if (differs([...nearest.inputs].sort(), [...composed.inputs].sort()) || nearest.bank !== composed.bank || differs([...nearest.exceptions].sort(), [...composed.exceptions].sort())) other = true;

  // The projections differ: if nothing above names it, or something above left a difference unnamed, say so.
  if (other || !lines.length) lines.push(OTHER_CHANGES);
  return lines;
}
