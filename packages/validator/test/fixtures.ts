import { each, loop, optional, pick, replicate, seq, step, walk, type Gate, type Recipe, type Step } from '@byway/recipe';

export const okGate = (): Gate => ({
  metric: 'critic-score',
  threshold: 9,
  hidden: true,
  holder: 'worker',
  probe: 2,
  max: 5,
  plateau: { minGain: 0.5, window: 2 },
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
});

const render = (id: string): Step =>
  step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const fix = (id: string): Step =>
  step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });

/** A compact C1-style protocol configuration that must validate cleanly (with C1-DR2 and C1-DR7). */
export function studio(): Recipe {
  return {
    schema: 'byway.recipe/1',
    id: 'studio-fixture',
    title: 'Studio fixture',
    kind: 'protocol-config',
    family: 'C1',
    channel: 'protocol',
    inputs: ['intent', 'tells'],
    stages: [
      {
        stage: 'D1',
        body: replicate(
          'x2',
          2,
          step({
            id: 'seed-build',
            role: 'seed',
            block: 'SEED',
            actor: 'model',
            tier: 'mid',
            prompt: 'article.SEED',
            consumes: ['intent'],
            produces: ['artifact'],
            writes: true,
            knobs: { source: 'shell-string' },
          }),
        ),
      },
      {
        stage: 'D2',
        body: seq(
          each(
            'each-candidate',
            seq(
              loop(
                'critic-loop',
                seq(
                  render('render-1'),
                  step({
                    id: 'critic',
                    role: 'critic',
                    block: 'CRITIC',
                    actor: 'model',
                    tier: 'big',
                    isolated: true,
                    frozenPrompt: true,
                    prompt: 'project.critic-ok',
                    consumes: ['view'],
                    produces: ['critique', 'score'],
                    knobs: { mode: 'OK' },
                  }),
                  fix('fix'),
                ),
                okGate(),
              ),
              optional(
                'asset-if-plain',
                'human calls the design plain',
                step({
                  id: 'asset',
                  role: 'asset',
                  block: 'ASSET',
                  actor: 'model',
                  tier: 'mid',
                  consumes: ['artifact'],
                  produces: ['artifact'],
                  writes: true,
                  knobs: { slots: 2 },
                }),
              ),
            ),
          ),
          pick('pick-final', 'H', 1, 'human'),
        ),
      },
      {
        stage: 'D3',
        body: seq(
          render('render-2'),
          step({ id: 'cut', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
          fix('apply-cut'),
          render('render-3'),
          step({
            id: 'tells-sweep',
            role: 'tells-sweep',
            block: 'TELLS',
            actor: 'model',
            tier: 'big',
            isolated: true,
            frozenPrompt: true,
            consumes: ['view', 'tells'],
            produces: ['critique'],
          }),
          fix('apply-swap'),
          render('render-4'),
          step({ id: 'tells-compare', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }),
          step({ id: 'voice', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true }),
          render('render-5'),
          step({
            id: 'check',
            role: 'check',
            block: 'CRITIC',
            variant: 'CRITIC-check',
            actor: 'model',
            tier: 'big',
            isolated: true,
            frozenPrompt: true,
            consumes: ['view'],
            produces: ['critique'],
            knobs: { mode: 'check' },
          }),
        ),
      },
    ],
    sitsOut: [],
    exceptions: ['C1-DR2', 'C1-DR7'],
    bank: true,
  };
}

/** A plain baseline arm with the fixed copy deck (needs SM-6). */
export function baseline(): Recipe {
  return {
    schema: 'byway.recipe/1',
    id: 'baseline-fixture',
    title: 'Baseline fixture',
    kind: 'baseline',
    family: 'baseline',
    channel: 'research-frozen',
    inputs: ['intent', 'voice'],
    stages: [
      {
        stage: 'D1',
        body: step({
          id: 'build',
          role: 'build',
          actor: 'model',
          tier: 'mid',
          prompt: 'article.B1',
          consumes: ['intent', 'voice'],
          produces: ['artifact'],
          writes: true,
        }),
      },
    ],
    sitsOut: [],
    exceptions: ['SM-6'],
    bank: false,
  };
}

/** Find a step by id (throws if absent). */
export function stepById(recipe: Recipe, id: string): Step {
  let found: Step | undefined;
  walk(recipe, (node) => {
    if (node.op === 'step' && node.id === id) found = node;
  });
  if (!found) throw new Error(`no step ${id}`);
  return found;
}

/** Find the first loop's gate. */
export function firstGate(recipe: Recipe): Gate {
  let gate: Gate | undefined;
  walk(recipe, (node) => {
    if (node.op === 'loop' && !gate) gate = node.gate;
  });
  if (!gate) throw new Error('no loop');
  return gate;
}
