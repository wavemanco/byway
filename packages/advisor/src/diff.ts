import { BLOCK_NAMES, STAGE_NAMES } from '@byway/catalog';
import type { BlockCode } from '@byway/protocol';
import type { Json, Loop, Node, Recipe, RelayChain, Replicate, Stage, Step } from '@byway/recipe';
import { stepLabel } from './present.ts';

/**
 * A composed recipe described as a diff from its nearest canonical recipe, in plain words (ADR-0058: "shown as a diff
 * from the nearest canonical one"). Steps are matched by id, then by what they are (role, block and who does them) in
 * order, so a renamed step reads as the same step. Hidden thresholds are never shown: a changed quality bar is
 * described, not quoted (the bar stays hidden from everyone who could game it).
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
        out.steps.push({ node: n, stage, always });
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

/** One knob change in plain words; the VOICE scope and the critic's mode get their own phrasing. */
function knobChange(name: string, before: Json | undefined, after: Json | undefined): string {
  if (name === 'scope' && after === 'every-line') return 'you write every line instead of the key lines';
  if (name === 'scope' && after === 'key-lines') return 'you write the key lines instead of every line';
  if (name === 'mode' && after === 'OK') return 'scores the work against a quality bar instead of ranking it among examples';
  if (name === 'mode' && after === 'GREAT') return 'ranks the work among examples instead of scoring it against a quality bar';
  if (name === 'refs') return after === undefined ? `no examples to compare with (was ${show(before)})` : `${show(after)} examples to compare with${before === undefined ? '' : ` instead of ${show(before)}`}`;
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

const named = (s: Step) => `${stepLabel(s)} (${s.id})`;
const renamed = (a: Step, b: Step) => `${stepLabel(b)} (${a.id === b.id ? b.id : `${a.id} → ${b.id}`})`;

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

export function diffFromNearest(composed: Recipe, nearest: Recipe, nearestName: string): string[] {
  const a = collect(nearest);
  const b = collect(composed);
  const lines: string[] = [];

  if (composed.medium !== nearest.medium) lines.push(`Makes ${composed.medium ?? 'an unspecified medium'} instead of ${nearest.medium ?? 'an unspecified medium'}.`);

  const steps = pair(a.steps, b.steps, ({ node: s }) => `${s.role}|${s.block ?? ''}|${s.actor}`);
  for (const r of steps.removed) lines.push(`Removed: ${named(r.node)}`);
  for (const x of steps.added) lines.push(`Added: ${named(x.node)}${x.always ? '' : ', when it applies'}`);
  for (const [x, y] of steps.pairs) {
    const changes = stepChanges(x, y);
    if (changes.length) lines.push(`Changed: ${renamed(x.node, y.node)}: ${changes.join('; ')}`);
  }

  // Loops pair by id, then by what ends them, then by stage (a loop that changed how it ends is still that loop).
  const loops = pair(a.loops, b.loops, ({ node: l }) => l.gate.metric, (l) => l.stage);
  for (const r of loops.removed) lines.push(`Removed: the repeat ${loopWords(r.node)} (${r.node.id})`);
  for (const x of loops.added) lines.push(`Added: a repeat of up to ${x.node.gate.max} rounds, ${loopWords(x.node)} (${x.node.id})`);
  for (const [x, y] of loops.pairs) {
    const changes: string[] = [];
    if (x.node.gate.metric !== y.node.gate.metric) changes.push(`${loopWords(y.node)} instead of ${loopWords(x.node)}`);
    if (x.node.gate.max !== y.node.gate.max) changes.push(`up to ${y.node.gate.max} rounds instead of ${x.node.gate.max}`);
    if (changes.length) lines.push(`Changed: the repeat (${x.node.id === y.node.id ? y.node.id : `${x.node.id} → ${y.node.id}`}): ${changes.join('; ')}`);
  }

  const reps = pair(a.replicates, b.replicates, () => 'replicate');
  for (const r of reps.removed) lines.push(`Removed: ${r.node.n} separate drafts (${r.node.id})`);
  for (const x of reps.added) lines.push(`Added: ${x.node.n} separate drafts (${x.node.id})`);
  for (const [x, y] of reps.pairs) if (x.node.n !== y.node.n) lines.push(`Changed: ${y.node.n} separate drafts instead of ${x.node.n} (${y.node.id})`);

  const relays = pair(a.relays, b.relays, () => 'relay');
  for (const r of relays.removed) lines.push(`Removed: the shot-by-shot motion chain (${r.node.id})`);
  for (const x of relays.added) lines.push(`Added: a shot-by-shot motion chain of up to ${x.node.maxLinks} shots (${x.node.id})`);
  for (const [x, y] of relays.pairs) if (x.node.maxLinks !== y.node.maxLinks) lines.push(`Changed: up to ${y.node.maxLinks} shots instead of ${x.node.maxLinks} (${y.node.id})`);

  const sitting = (r: Recipe) => new Map(r.sitsOut.map((s) => [s.block, s.reason]));
  const outA = sitting(nearest);
  const outB = sitting(composed);
  for (const [block, reason] of outB) if (!outA.has(block)) lines.push(`Leaves out ${BLOCK_NAMES[block as BlockCode]}: ${reason}`);

  return lines.length ? lines : [`The same steps as ${nearestName}.`];
}
