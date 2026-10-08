/**
 * Small recipes for testing one control or operator at a time (the protocol configurations are run whole in their own
 * test files). They are workspace-channel recipes, so the catalog has no presentation for them.
 */
import { loop, pick, relay, replicate, route, seq, step, withHash, type Node, type Recipe, type Step } from '@byway/recipe';
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

/** Two people's own diffs, written side by side: one bad draft fails the run while the other is still open. */
export const twoAuthors = recipe(
  'two-authors',
  'code-diff',
  replicate('both', 2, step({ id: 'own-diff', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true })),
);

/** A draft, a CUT by a model (or by a person), and the fix that applies it. */
const applyCut = step({ id: 'apply-cut', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.apply-cut', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
export const trimmed = recipe(
  'trimmed',
  'prose',
  seq(build('draft'), render('render'), step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.trim', consumes: ['view'], produces: ['critique'] }), applyCut),
);
export const trimmedByHand = recipe('trimmed-by-hand', 'prose', seq(build('draft'), render('render'), step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }), applyCut));

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

const relayStep = (id: string, consumes: Step['consumes']): Step =>
  step({ id, role: 'relay', block: 'RELAY', actor: 'model', tier: 'mid', prompt: `product.test.${id}`, consumes, produces: ['artifact', 'anchor'], writes: true });

/** A storyboard, its frames, and a two-link relay whose links are checked and regenerated until clean. */
export const shortAd = recipe(
  'short-ad',
  'media',
  seq(
    build('board'),
    step({ id: 'frames', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: 'product.test.frames', consumes: ['artifact'], produces: ['artifact', 'anchor'], writes: true }),
    relay(
      'links',
      2,
      seq(
        relayStep('clip', ['anchor', 'artifact']),
        loop(
          'repair',
          seq(render('shot-render'), step({ id: 'shot-check', role: 'check', actor: 'model', tier: 'big', prompt: 'product.test.shot-check', consumes: ['view'], produces: ['critique'] }), relayStep('regenerate', ['critique', 'artifact'])),
          { metric: 'check-clean', hidden: false, holder: 'harness', probe: 1, max: 3, onCap: 'human', onNoConverge: 'recalibrate-human' },
        ),
      ),
    ),
  ),
);

/** A critic loop whose cap is settled by policy: the best snapshot, re-ranked in a fresh call. */
export const policyLoop = recipe(
  'policy-loop',
  'prose',
  seq(
    build('draft'),
    loop(
      'polish',
      seq(
        render('render'),
        step({ id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.critic', consumes: ['view'], produces: ['critique', 'score'], knobs: { mode: 'OK' } }),
        step({ id: 'revise', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.revise', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true }),
      ),
      { metric: 'critic-score', threshold: 9, hidden: true, holder: 'worker', probe: 1, max: 3, onCap: 'policy-best-snapshot', onNoConverge: 'continue' },
    ),
  ),
);

/** A storyboard whose voice-over you write, then a machine pass that must keep your words (keepsVoice). */
export const scripted = recipe(
  'scripted',
  'media',
  seq(
    build('board'),
    step({ id: 'script', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, variant: 'VOICE-early', knobs: { scope: 'every-line' } }),
    step({ id: 'polish', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true }),
  ),
);

/** A page, then your words on it (VOICE on a web page: one line per block of copy). */
export const voicedPage = recipe(
  'voiced-page',
  'web-page',
  seq(build('page'), step({ id: 'voice', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, knobs: { scope: 'every-line' } })),
);

/** A memo, then the owner signs off its claims (the C4 claim log). */
export const claimLogged = recipe(
  'claim-logged',
  'prose',
  seq(build('memo'), step({ id: 'claims', role: 'voice', block: 'VOICE', variant: 'claim-log', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true })),
);

/** Three drafts, then a judge (pick C) or chance (pick R) keeps one. */
const judgeStep = step({ id: 'judge', role: 'judge', actor: 'model', tier: 'big', isolated: true, prompt: 'product.test.judge', consumes: ['option_set<artifact>'], produces: ['option_set<artifact>'] });
export const judgedPick = recipe('judged-pick', 'prose', seq(replicate('drafts', 3, build('draft')), pick('choose', 'C', 1, 'model', judgeStep)));
export const randomPick = recipe('random-pick', 'prose', seq(replicate('drafts', 3, build('draft')), pick('choose', 'R', 1, 'policy')));
