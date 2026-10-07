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
 * Compute-matched best-of-N (Study 1 D1): plain builds, rendered and picked down to 4 by the same isolated
 * critic. N is a planning value; the pilot's cost measurement sets it before the freeze.
 */
export const bBon = baseline(
  'b-bon',
  'B-BoN (compute-matched best-of-N, same critic as selector)',
  seq(
    replicate('bon-pool', 16, plainBuild('build', 'article.B1', ['intent', 'voice'])),
    pick(
      'bon-select',
      'C',
      4,
      'model',
      step({
        id: 'bon-judge',
        role: 'judge',
        block: 'CRITIC',
        actor: 'model',
        tier: 'big',
        isolated: true,
        frozenPrompt: true,
        prompt: 'project.critic-ok',
        consumes: ['view'],
        produces: ['score'],
        knobs: { mode: 'OK' },
      }),
    ),
  ),
);

export const baselines: Recipe[] = [bPlain, bRandom, bSkill, bBon];
