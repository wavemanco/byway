/**
 * What scope typing costs, counted, not timed (ADR-0092). Admission runs it synchronously, in compose (up to three times
 * with repairs) and again at web start, on whatever a composer returns. A loop body or a relay link is typed again from
 * the state its back-edge brings (set-aside), and a relay link once more without its anchor (ST11); both re-typings
 * are memoized by what they read, so nesting does not multiply them.
 *
 * The old cost is scope typing before ADR-0092: every node typed once, except that a relay typed its link twice (the
 * chain, then the link without its anchor), which doubled at every nested relay. With no option work in a nest, the cost
 * is linear; a nest holding picks and person's writes brings a new option-set state at each enclosing later round (it
 * records who set the options aside), so its cost grows with the square of the depth, and no faster.
 */
import { describe, expect, it } from 'vitest';
import { loop, optional, pick, relay, replicate, seq, step, type Gate, type Node, type Recipe, type Step } from '@byway/recipe';
import { Findings } from '../src/context.ts';
import { typeRecipe } from '../src/scope.ts';

const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const clip = (id: string): Step =>
  step({ id, role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true });
const rounds: Gate = { metric: 'human', hidden: false, holder: 'human', probe: 1, max: 1, onCap: 'human', onNoConverge: 'recalibrate-human' };
const threeRounds: Gate = { ...rounds, max: 3 };
const own = (id: string): Step => step({ id, role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true });
const variants = (id: string): Node => replicate(id, 2, step({ id: `${id}-v`, role: 'build', actor: 'model', tier: 'mid', consumes: ['artifact'], produces: ['artifact'], writes: true }));
/** Nested loops holding option work (the round-2 verifier's shape): optional variants, the inner level, then a person's write; innermost, variants and a pick of one. */
const loopsWithWrites = (d: number): Node =>
  Array.from({ length: d }, (_, i) => i).reduce<Node>((n, i) => loop(`l${i}`, seq(optional(`o${i}`, 'x', variants(`rep${i}`)), n, own(`own${i}`)), threeRounds), seq(variants('rep-in'), pick('p-in', 'R', 1, 'policy')));
const nodesOf = (n: Node): number => 1 + ('steps' in n ? n.steps.reduce((sum, c) => sum + nodesOf(c), 0) : 'body' in n ? nodesOf(n.body) : 0);

const nestedLoops = (d: number): Node => Array.from({ length: d }, (_, i) => i).reduce<Node>((n, i) => loop(`l${i}`, n, rounds), render('x'));
const nestedRelays = (d: number): Node => Array.from({ length: d }, (_, i) => i).reduce<Node>((n, i) => relay(`r${i}`, 1, n), clip('clip'));
/** Loops and relays alternating, each level also holding a step of its own. */
const mixed = (d: number): Node =>
  Array.from({ length: d }, (_, i) => i).reduce<Node>((n, i) => (i % 2 ? loop(`l${i}`, seq(render(`r-${i}`), n), rounds) : relay(`c${i}`, 1, seq(clip(`clip-${i}`), n))), clip('clip'));

function recipeOf(body: Node): Recipe {
  return {
    schema: 'byway.recipe/1',
    id: 'scope-cost',
    title: 'Scope cost',
    kind: 'protocol-config',
    family: 'C5',
    channel: 'protocol',
    inputs: ['intent'],
    stages: [{ stage: 'D1', body: seq(step({ id: 'board', role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact', 'anchor'], writes: true }), body) }],
    sitsOut: [],
    exceptions: [],
    bank: false,
  };
}

/** Node visits of one typing of the recipe (a memoized re-typing that finds its answer counts nothing). */
function visits(r: Recipe): number {
  const stats = { visits: 0 };
  typeRecipe(r, new Findings(), stats);
  return stats.visits;
}

/** The seq, the board step, and what the body holds. */
const OUTSIDE = 2;

describe('scope typing cost: no more than before ADR-0092 for nests with no option work, at most quadratic in depth with it', () => {
  it.each([1, 2, 4, 8, 12, 16])('nested loops, depth %i: every node typed once, as before', (d) => {
    const nodes = d + 1;
    expect(visits(recipeOf(nestedLoops(d)))).toBeLessThanOrEqual(OUTSIDE + nodes);
  });

  it.each([1, 2, 4, 8, 12, 16])('nested relays, depth %i: at most twice per node, where before it doubled per level', (d) => {
    const before = 2 ** (d + 1) - 1;
    const now = visits(recipeOf(nestedRelays(d)));
    expect(now).toBeLessThanOrEqual(OUTSIDE + Math.min(before, 2 * (d + 1)));
  });

  it.each([1, 4, 16, 64])('nested loops holding picks and person\x27s writes, depth %i: at most nodes × (depth + 2) visits, quadratic and no worse', (d) => {
    const body = loopsWithWrites(d);
    const nodes = OUTSIDE + nodesOf(body);
    const v = visits(recipeOf(body));
    expect(v).toBeLessThanOrEqual(nodes * (d + 2));
    // The shape does reach the later rounds: past a few levels it costs more than a visit or two per node.
    if (d >= 16) expect(v).toBeGreaterThan(2 * nodes);
  });

  it('a deep recipe (200 levels, loops and relays alternating) is typed in a bounded number of visits', () => {
    const r = recipeOf(mixed(200));
    const nodes = 200 * 3 + 1;
    const findings = new Findings();
    const stats = { visits: 0 };
    typeRecipe(r, findings, stats);
    expect(stats.visits).toBeGreaterThanOrEqual(OUTSIDE + nodes);
    expect(stats.visits).toBeLessThanOrEqual(3 * (OUTSIDE + nodes));
  });
});
