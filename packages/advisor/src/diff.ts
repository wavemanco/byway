import { BLOCK_NAMES, presentedStepFor, STAGE_NAMES } from '@byway/catalog';
import type { Medium, RecipePresentation } from '@byway/contracts';
import type { BlockCode } from '@byway/protocol';
import { walkNode, type Json, type Loop, type Node, type Pick, type Recipe, type RelayChain, type Replicate, type Stage, type Step } from '@byway/recipe';
import { stepLabel } from './present.ts';

/**
 * A composed recipe described as a diff from its nearest canonical recipe, in plain words (ADR-0058: "shown as a diff
 * from the nearest canonical one"). Steps are matched by id, then by what they are (role, block and who does them) in
 * order, so a renamed step reads as the same step. Hidden thresholds are never shown: a changed quality bar is
 * described, not quoted (the bar stays hidden from everyone who could game it).
 *
 * Plain words by default (spec §5, UX-13): steps, repeats and parallel drafts are named by the labels the person saw
 * (the nearest recipe's presentation where it has the step, else the block or role name), with the stage they run in;
 * node ids and medium codes are never shown. ComposeResult.diff is a list of strings, so ids have nowhere to go that
 * only "Show technical names" would reveal; they stay in the recipe itself.
 */

interface Placed<T> {
  node: T;
  stage: Stage['stage'];
  /** False when the node sits inside an optional or a route, so a run may skip it. */
  always: boolean;
}

function collect(recipe: Recipe): { steps: Placed<Step>[]; loops: Placed<Loop>[]; replicates: Placed<Replicate>[]; relays: Placed<RelayChain>[] } {
  const out = { steps: [] as Placed<Step>[], loops: [] as Placed<Loop>[], replicates: [] as Placed<Replicate>[], relays: [] as Placed<RelayChain>[] };
  const visit = (n: Node, stage: Stage['stage'], always: boolean): void => {
    switch (n.op) {
      case 'step':
        // Renders are glue: they follow from the steps that read them, so they would only add noise.
        if (n.role !== 'render') out.steps.push({ node: n, stage, always });
        return;
      case 'seq':
        n.steps.forEach((c) => visit(c, stage, always));
        return;
      case 'pick':
        return;
      case 'route':
        n.branches.forEach((b) => visit(b.body, stage, false));
        return;
      case 'audit':
        n.lenses.forEach((l) => visit(l.body, stage, always));
        return;
      case 'optional':
        visit(n.body, stage, false);
        return;
      case 'loop':
        out.loops.push({ node: n, stage, always });
        break;
      case 'replicate':
        out.replicates.push({ node: n, stage, always });
        break;
      case 'relay':
        out.relays.push({ node: n, stage, always });
        break;
    }
    visit(n.body, stage, always);
  };
  recipe.stages.forEach((s) => visit(s.body, s.stage, true));
  return out;
}

/** Pair items by id, then by signature in order. Returns the pairs and what is left on each side. */
function pair<T extends { id: string }>(
  before: Placed<T>[],
  after: Placed<T>[],
  ...signatures: ((n: Placed<T>) => string)[]
): { pairs: [Placed<T>, Placed<T>][]; removed: Placed<T>[]; added: Placed<T>[] } {
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

function stepChanges(a: Placed<Step>, b: Placed<Step>): string[] {
  const out: string[] = [];
  if (a.node.actor !== b.node.actor) out.push(`done by ${WHO[b.node.actor]} instead of ${WHO[a.node.actor]}`);
  if (a.stage !== b.stage) out.push(`runs in ${STAGE_NAMES[b.stage]} instead of ${STAGE_NAMES[a.stage]}`);
  if (a.always !== b.always) out.push(b.always ? 'now always runs' : 'now runs only when it applies');
  if ((a.node.tier ?? '') !== (b.node.tier ?? '') && b.node.tier) out.push(b.node.tier === 'big' ? 'uses the bigger model' : 'uses the faster model');
  if ((a.node.prompt ?? '') !== (b.node.prompt ?? '')) out.push('uses different instructions');
  const ka = a.node.knobs ?? {};
  const kb = b.node.knobs ?? {};
  for (const name of [...new Set([...Object.keys(ka), ...Object.keys(kb)])]) {
    if (JSON.stringify(ka[name]) !== JSON.stringify(kb[name])) out.push(knobChange(name, ka[name], kb[name]));
  }
  return out;
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

/** A step as the person knows it: its shown label, and the stage it runs in. */
const named = (p: Placed<Step>, labels: Labels) => `${labels(p.node.id) ?? stepLabel(p.node)} (${STAGE_NAMES[p.stage]})`;

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

/**
 * The composed recipe's differences from its nearest canonical one, one plain line each. `nearestPresentation` names
 * the nearest recipe's steps as the person saw them; without it, steps are named from their block or role.
 */
export function diffFromNearest(composed: Recipe, nearest: Recipe, nearestName: string, nearestPresentation?: RecipePresentation): string[] {
  const a = collect(nearest);
  const b = collect(composed);
  const lines: string[] = [];
  const shown: Labels = (id) => (nearestPresentation ? presentedStepFor(nearestPresentation, id)?.label : undefined);
  // The composed recipe's own steps are named from its blocks and roles: a nearest label could name something else there.
  const own: Labels = () => undefined;

  if (composed.medium !== nearest.medium) lines.push(`Makes ${mediumWords(composed.medium)} instead of ${mediumWords(nearest.medium)}.`);

  const steps = pair(a.steps, b.steps, ({ node: s }) => `${s.role}|${s.block ?? ''}|${s.actor}`);
  for (const r of steps.removed) lines.push(`Removed: ${named(r, shown)}`);
  for (const x of steps.added) lines.push(`Added: ${named(x, own)}${x.always ? '' : ', when it applies'}`);
  for (const [x, y] of steps.pairs) {
    const changes = stepChanges(x, y);
    if (changes.length) lines.push(`Changed: ${named({ ...y, node: x.node }, shown)}: ${changes.join('; ')}`);
  }

  // Loops pair by id, then by what ends them, then by stage (a loop that changed how it ends is still that loop).
  const loops = pair(a.loops, b.loops, ({ node: l }) => l.gate.metric, (l) => l.stage);
  for (const r of loops.removed) lines.push(`Removed: repeating ${bodyLabel(r.node, shown)} ${loopWords(r.node)}`);
  for (const x of loops.added) lines.push(`Added: ${bodyLabel(x.node, own)} repeated up to ${counted(x.node.gate.max, 'round')}, ${loopWords(x.node)}`);
  for (const [x, y] of loops.pairs) {
    const changes: string[] = [];
    if (x.node.gate.metric !== y.node.gate.metric) changes.push(`${loopWords(y.node)} instead of ${loopWords(x.node)}`);
    if (x.node.gate.max !== y.node.gate.max) changes.push(`up to ${counted(y.node.gate.max, 'round')} instead of ${x.node.gate.max}`);
    if (changes.length) lines.push(`Changed: ${bodyLabel(x.node, shown)} repeats ${changes.join('; ')}`);
  }

  const reps = pair(a.replicates, b.replicates, () => 'replicate');
  for (const r of reps.removed) lines.push(`Removed: ${bodyLabel(r.node, shown)}: ${counted(r.node.n, 'separate draft')}`);
  for (const x of reps.added) lines.push(`Added: ${bodyLabel(x.node, own)}: ${counted(x.node.n, 'separate draft')}`);
  for (const [x, y] of reps.pairs) if (x.node.n !== y.node.n) lines.push(`Changed: ${bodyLabel(x.node, shown)}: ${counted(y.node.n, 'separate draft')} instead of ${x.node.n}`);

  const relays = pair(a.relays, b.relays, () => 'relay');
  for (const _r of relays.removed) lines.push('Removed: the shot-by-shot motion chain');
  for (const x of relays.added) lines.push(`Added: a shot-by-shot motion chain of up to ${counted(x.node.maxLinks, 'shot')}`);
  for (const [x, y] of relays.pairs) if (x.node.maxLinks !== y.node.maxLinks) lines.push(`Changed: the motion chain makes up to ${counted(y.node.maxLinks, 'shot')} instead of ${x.node.maxLinks}`);

  const sitting = (r: Recipe) => new Map(r.sitsOut.map((s) => [s.block, s.reason]));
  const outA = sitting(nearest);
  const outB = sitting(composed);
  for (const [block, reason] of outB) if (!outA.has(block)) lines.push(`Leaves out ${BLOCK_NAMES[block as BlockCode]}: ${reason}`);

  return lines.length ? lines : [`The same steps as ${nearestName}.`];
}
