/**
 * Small random recipes for property tests: every operator, nested a few levels, with the steps the flow rules act on
 * (writers and keepsVoice writers, person's writes and VOICE, keep-or-reverts, critics and checks that end a loop's
 * round, Distill blocks, renders). They need not validate; they exercise every path of the flow walk. Deterministic: a
 * seed gives the same recipes on every run.
 */
import { audit, each, loop, oneShotGate, optional, pick, relay, replicate, route, seq, step, type Gate, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';

/** mulberry32: a small seeded generator. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEPS: ((id: string) => Step)[] = [
  (id) => step({ id, role: 'build', actor: 'model', tier: 'mid', consumes: ['intent'], produces: ['artifact'], writes: true }),
  (id) => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true }),
  (id) => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true }),
  (id) => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'] }),
  (id) => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'] }),
  (id) => step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique'] }),
  (id) => step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true }),
  (id) => step({ id, role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true }),
  (id) => step({ id, role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }),
  (id) => step({ id, role: 'tells-sweep', block: 'TELLS', actor: 'model', tier: 'big', isolated: true, consumes: ['view', 'tells'], produces: ['critique'] }),
  (id) => step({ id, role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
  (id) => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] }),
  (id) => step({ id, role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true }),
];

const METRICS = ['critic-score', 'critic-rank', 'check-clean', 'human'] as const;
const gateOf = (metric: string, max: number): Gate => ({
  metric,
  ...(metric === 'critic-score' || metric === 'critic-rank' ? { threshold: 7 } : {}),
  hidden: metric !== 'human',
  holder: metric === 'human' ? 'human' : 'harness',
  probe: 1,
  max,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

/** A random recipe of up to `depth` levels of operators. */
export function randomRecipe(next: () => number, depth: number): Recipe {
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const pickOf = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const leaf = (): Step => pickOf(STEPS)(id('s'));
  const node = (d: number): Node => {
    if (d <= 0 || next() < 0.3) return leaf();
    const kids = (k: number) => Array.from({ length: k }, () => node(d - 1));
    switch (Math.floor(next() * 11)) {
      case 0:
      case 1:
        return seq(...kids(2 + Math.floor(next() * 3)));
      case 2:
        return loop(id('loop'), seq(...kids(2 + Math.floor(next() * 2))), gateOf(pickOf(METRICS), 1 + Math.floor(next() * 3)));
      case 3:
        return relay(id('relay'), 1 + Math.floor(next() * 3), seq(...kids(2)));
      case 4:
        return optional(id('opt'), 'when it applies', node(d - 1));
      case 5:
        return route(id('route'), 'which way', [
          { name: 'a', body: node(d - 1) },
          { name: 'b', body: node(d - 1) },
        ]);
      case 6:
        return audit(id('audit'), [
          { name: 'one', body: node(d - 1) },
          { name: 'two', body: node(d - 1) },
        ]);
      case 7:
        return oneShotGate(id('gate'), node(d - 1), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' });
      case 8:
        return replicate(id('rep'), 2, node(d - 1));
      case 9:
        return each(id('each'), node(d - 1));
      default:
        return seq(replicate(id('rep'), 2, leaf()), pick(id('pick'), pickOf(['H', 'C', 'R'] as const), 1, 'human', step({ id: id('judge'), role: 'judge', actor: 'model', tier: 'big', isolated: true, consumes: ['view'], produces: [] })));
    }
  };
  const stages: Stage['stage'][] = ['D1', 'D2', 'D3'];
  return {
    schema: 'byway.recipe/1',
    id: 'random',
    title: 'Random',
    kind: 'protocol-config',
    family: 'C1',
    channel: 'protocol',
    medium: 'web-page',
    inputs: next() < 0.2 ? ['intent', 'voice', 'tells'] : ['intent', 'tells'],
    stages: stages.map((stage) => ({ stage, body: node(depth) })),
    sitsOut: [],
    exceptions: [],
    bank: true,
  };
}
