/**
 * Small recipes for testing one control or operator at a time (the protocol configurations are run whole in their own
 * test files). They are workspace-channel recipes, so the catalog has no presentation for them.
 */
import { loop, pick, relay, replicate, route, seq, step, withHash, type Node, type Recipe, type Step } from '@byway/recipe';
import type { Medium } from '@byway/contracts';

const recipe = (id: string, medium: Medium, body: Node, as: Partial<Recipe> = {}): Recipe =>
  withHash({ schema: 'byway.recipe/1', id, title: id, kind: 'composed', family: 'test', channel: 'workspace', medium, inputs: ['intent'], stages: [{ stage: 'D1', body }], sitsOut: [], exceptions: [], bank: false, ...as });

const build = (id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: `product.test.${id}`, consumes: ['intent'], produces: ['artifact'], writes: true, ...extra });
const react = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes: ['artifact'], produces: ['taste'] });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });

/** Draft, a person reacts, the AI revises. */
export const tiny = recipe('tiny', 'prose', seq(build('draft'), react('react'), step({ id: 'revise', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.revise', consumes: ['taste', 'artifact'], produces: ['artifact'], writes: true })));

/** Three pages built and rendered concurrently, then a person picks one. */
export const threePages = recipe('three-pages', 'web-page', seq(replicate('three', 3, seq(build('page'), render('shot'))), pick('pick', 'H', 2, 'human')));

/**
 * A fan-out at the composed limits' peak (F02, SUB-DA-4): two slots of a replicate at its limit (COMPOSED_LIMITS: 16 per
 * replicate, 32 steps at once), every branch one model call, then a step that can start only once they have all ended.
 */
export const cancelPeak = recipe('cancel-peak', 'prose', seq(replicate('slots', 2, replicate('drafts', 16, build('draft'))), build('after')));

/**
 * A fan-out a failure ends (RS-4, FANOUT-FAILURE): four drafts side by side, then a step that can start only once they
 * have all ended. A draft refused at the budget, which the person does not raise, fails the run while the others are
 * still in flight.
 */
export const fanOutFailure = recipe('fan-out-failure', 'prose', seq(replicate('drafts', 4, build('draft')), build('after')));

/** A route: the AI drafts, or you do. */
export const routed = recipe(
  'routed',
  'prose',
  route('who', 'who writes the first draft', [
    { name: 'ai', body: build('ai-draft') },
    { name: 'own', body: step({ id: 'own-draft', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true }) },
  ]),
);

/**
 * Two people's own diffs, written side by side, each tidied by a model once it is in: a tidy that fails fails the run
 * while the other draft is still asked for. (A draft byway cannot read is asked again, never a failed run: ENG-6.)
 */
export const twoAuthors = recipe(
  'two-authors',
  'code-diff',
  replicate(
    'both',
    2,
    seq(
      step({ id: 'own-diff', role: 'build', actor: 'human', consumes: ['intent'], produces: ['artifact'], writes: true }),
      step({ id: 'tidy', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.tidy', consumes: ['artifact'], produces: ['artifact'], writes: true }),
    ),
  ),
);

/** A draft, a CUT by a model (or by a person), and the fix that applies it. */
const applyCut = step({ id: 'apply-cut', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.apply-cut', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
export const trimmed = recipe(
  'trimmed',
  'prose',
  seq(build('draft'), render('render'), step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.trim', consumes: ['view'], produces: ['critique'] }), applyCut),
);
export const trimmedByHand = recipe('trimmed-by-hand', 'prose', seq(build('draft'), render('render'), step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }), applyCut));

/**
 * Your list, then a route (F01 (a)): the AI applies it, or you revise the draft yourself, which is shown the work and
 * never your list. Admitted on decision 7's some-path reading (the AI branch hands it on); on the other branch it goes
 * unused, and the run says so.
 */
export const routedTrim = recipe(
  'routed-trim',
  'prose',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
    route('who', 'who applies your list', [
      { name: 'ai', body: applyCut },
      { name: 'own', body: step({ id: 'own-revise', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true }) },
    ]),
  ),
);

/** routedTrim whose own branch then seeds a fresh draft on C1's seed prompt, which asks for its direction first. */
export const reseededTrim = recipe(
  'reseeded-trim',
  'web-page',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
    route('who', 'who applies your list', [
      { name: 'ai', body: applyCut },
      {
        name: 'own',
        body: seq(
          step({ id: 'own-revise', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true }),
          step({ id: 'reseed', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'article.SEED', consumes: ['intent'], produces: ['artifact'], writes: true, knobs: { source: 'shell-string', structuralAxis: true } }),
        ),
      },
    ]),
  ),
);

/** A person's list applied by two AI candidates, then a pick of 2 from 2 that takes both with no event of its own. */
export const twoTrims = recipe(
  'two-trims',
  'prose',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'trim', role: 'cut', block: 'CUT', actor: 'human', consumes: ['view'], produces: ['critique'] }),
    replicate('two', 2, applyCut),
    pick('pick', 'H', 2, 'human'),
  ),
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

/**
 * A critic loop whose cap is settled by policy: the best snapshot, re-ranked in a fresh call. Only a study may hand a
 * critic loop's cap to a policy (LS1, relaxed by SM-2), so it is a research recipe, as Runner.start requires (F01 (d)).
 */
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
  { kind: 'variant', family: 'C1', channel: 'research-frozen', exceptions: ['SM-2'] },
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

/** A draft, a cliché sweep, the swaps a person chose, and their keep-or-revert (the TELLS of C1, C3, C4, C5, C7). */
export const swept = recipe(
  'swept',
  'prose',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'sweep', role: 'tells-sweep', block: 'TELLS', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.sweep', consumes: ['view', 'tells'], produces: ['critique'] }),
    step({ id: 'swaps', role: 'fix', actor: 'model', tier: 'mid', prompt: 'product.test.swaps', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true }),
    render('compare-render'),
    step({ id: 'compare', role: 'tells-compare', block: 'TELLS', actor: 'human', consumes: ['view'], produces: ['taste'] }),
  ),
);

/** A memo the AI illustrates: image briefs, two images, then the model places them. */
export const illustrated = recipe(
  'illustrated',
  'prose',
  seq(build('memo'), step({ id: 'art', role: 'asset', block: 'ASSET', actor: 'model', tier: 'mid', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true, knobs: { slots: 2 } })),
);

/** A draft ranked by a GREAT critic over two fixed shuffles, averaged (the C5 gate's form). */
export const twiceJudged = recipe(
  'twice-judged',
  'prose',
  seq(
    build('draft'),
    render('render'),
    step({ id: 'critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'product.test.critic', consumes: ['view', 'refs'], produces: ['critique', 'score'], knobs: { mode: 'GREAT', refs: 4, shuffle: true, shuffles: 2 } }),
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
