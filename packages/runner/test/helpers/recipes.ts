/**
 * Small recipes for testing one control or operator at a time (the protocol configurations are run whole in their own
 * test files). They are workspace-channel recipes, so the catalog has no presentation for them.
 */
import { pick, replicate, route, seq, step, withHash, type Node, type Recipe, type Step } from '@byway/recipe';
import type { Medium } from '@byway/contracts';

const recipe = (id: string, medium: Medium, body: Node): Recipe =>
  withHash({ schema: 'byway.recipe/1', id, title: id, kind: 'composed', family: 'test', channel: 'workspace', medium, inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false });

const build = (id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: `product.test.${id}`, consumes: ['intent'], produces: ['artifact'], writes: true, ...extra });
const react = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes: ['artifact'], produces: ['taste'] });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

/** Draft, a person reacts, the AI revises. */
export const tiny = recipe('tiny', 'prose', seq(build('draft'), react('react'), step({ id: 'revise', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.revise', consumes: ['taste', 'artifact'], produces: ['artifact'], writes: true })));

/** Three pages built and rendered concurrently, then a person picks one. */
export const threePages = recipe('three-pages', 'web-page', seq(replicate('three', 3, seq(build('page'), render('shot'))), pick('pick', 'H', 2, 'human')));

/** A route: the AI drafts, or you do. */
export const routed = recipe(
  'routed',
  'prose',
  route('who', 'who writes the first draft', [
    { name: 'ai', body: build('ai-draft') },
    { name: 'own', body: step({ id: 'own-draft', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true }) },
  ]),
);

/** A seeded draft (SEED: the runner's random string, never written into the work). */
export const seeded = recipe('seeded', 'prose', step({ id: 'spark', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'product.test.spark', consumes: ['intent'], produces: ['artifact'], writes: true, knobs: { source: 'shell-string' } }));

/** A draft judged once by a GREAT-mode critic. */
export const judged = recipe(
  'judged',
  'prose',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.critic', consumes: ['view', 'refs'], produces: ['critique', 'score'], knobs: { mode: 'GREAT', refs: 4, shuffle: true } }),
  ),
);
