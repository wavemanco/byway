import { pick, replicate, seq, step, withHash, type Node, type Recipe } from '@byway/recipe';
import { plainBuild } from './steps.ts';

function baseline(id: string, title: string, body: Node): Recipe {
  return withHash({
    schema: 'byway.recipe/1',
    id,
    title,
    kind: 'baseline',
    family: 'baseline',
    channel: 'research-frozen',
    inputs: ['intent', 'voice'],
    stages: [{ stage: 'D1', body }],
    sitsOut: [],
    exceptions: ['SM-6'],
    bank: false,
  });
}

/** Four independent fresh sessions per brief, like every Study 1 arm. */
const x4 = (prompt: string, knobs?: Record<string, string>) =>
  replicate('x4', 4, plainBuild('build', prompt, ['intent', 'voice'], knobs));

/** The article's plain prompt (Baseline 1). */
export const bPlain = baseline('b-plain', 'B-Plain (article Baseline 1)', x4('article.B1'));

/** The article's "totally unique, completely at random" prompt (Baseline 2). */
export const bRandom = baseline('b-random', 'B-Random (article Baseline 2)', x4('article.B2'));

/** B-Plain with Anthropic's frontend-design skill, pinned by a registered rule (Study 1 D1). */
export const bSkill = baseline('b-skill', 'B-Skill (plain prompt + frontend-design skill)', x4('article.B1', { skill: 'anthropic/frontend-design@registered-pin' }));

/**
 * Planning value for B-BoN's N. Study 1 sets N in Stage 1 so that the mean cost per slot equals C1-H's
 * pilot-measured mean cost per candidate ([PILOT]); the recipe is regenerated, and its hash changes, when N is fixed.
 * 5 ≈ C1-H's estimated cost per candidate ÷ B-Plain's (cost_model.py, unverified).
 */
export const BON_N_PLANNING = 5;

/**
 * Compute-matched best-of-N (Study 1 §3.1, §5.3): for each of the 4 candidate slots, N B-Plain builds are made
 * (build 1 reuses B-Plain's own candidate at run time), then one fresh Fable selector call (A.14) sees the N views,
 * shuffled and labelled, and returns one label.
 */
export const bBon = baseline(
  'b-bon',
  `B-BoN (per-slot best-of-${BON_N_PLANNING}, A.14 selector; N is a planning value until Stage 1)`,
  replicate(
    'x4',
    4,
    seq(
      replicate('bon-pool', BON_N_PLANNING, plainBuild('build', 'article.B1', ['intent', 'voice'])),
      pick(
        'bon-select',
        'C',
        1,
        'model',
        step({
          id: 'bon-selector',
          role: 'judge',
          actor: 'model',
          tier: 'big',
          isolated: true,
          frozenPrompt: true,
          prompt: 'study1.A14',
          consumes: ['view'],
          produces: [],
        }),
      ),
    ),
  ),
);

export const baselines: Recipe[] = [bPlain, bRandom, bSkill, bBon];
