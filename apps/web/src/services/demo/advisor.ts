/**
 * The demo advisor: implements the Advisor contract with keyword intake instead of a model call. Routing is
 * the protocol's chooser (the first yes decides; spec §4), so flipping an answer re-routes deterministically,
 * exactly as the real advisor will. Labels are computed, never typed: every recipe is untested (CR11).
 */
import type { Advisor, ChooserAnswer, ComposeResult, CostEstimate, EvidenceLabel, ProblemBrief, Recommendation, RecipePresentation } from '@byway/contracts';
import { withHash, type Node, type Recipe } from '@byway/recipe';
import { ESTIMATES, PRESENTATIONS, PROFILE_PRICE_SCALE, QUESTIONS, QUESTION_KEYWORDS, presentationFor } from './catalog.ts';
import { demoRecipes } from './recipes.ts';
import { hashOf } from './samples/text.ts';

const STRONG = 0.7;

const WHY: Record<string, string> = {
  c1: 'It is something people look at on a screen, so it is drafted four different ways and finished by you.',
  c2: 'You need options to choose from rather than one finished piece, so it widens first and you pick.',
  c3: 'It is writing published as a series, so each piece starts from a fresh angle and ends in your voice.',
  c4: 'It reads like an everyday document, where the ask up front and a short read matter most.',
  c5: 'Image and video models make the piece itself, so it chains them around your concept and script.',
  c6: 'It needs to show your own effort, so you write it and AI only points.',
  c6a: 'It is fiction you write yourself, so AI offers premises and notes but never your prose.',
  c7: 'It is an AI-written code change, so the work is making it smaller and easier to review.',
};

const UNTESTED: EvidenceLabel = {
  verdict: 'Untested',
  scope: 'None',
  summary: 'Not yet tested. No study of this recipe has reported.',
  studies: [],
};

const COMPOSED: EvidenceLabel = {
  verdict: 'Untested',
  scope: 'Composed',
  summary: 'Composed for your problem from the protocol’s blocks. A composed recipe is not tested and does not inherit any label.',
  studies: [],
};

function intake(problem: ProblemBrief): ChooserAnswer[] {
  const text = ` ${[problem.text, problem.deliverable ?? ''].join(' ').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ')} `;
  const attached = problem.attachments?.some((a) => /^(diff --git|--- |\+\+\+ )/m.test(a.text)) ?? false;
  return QUESTIONS.map((q) => {
    const hits = (QUESTION_KEYWORDS[q.id] ?? []).filter((k) => text.includes(k.replace(/[^\p{L}\p{N}' ]+/gu, ' ')));
    if (q.id === 'code' && attached) hits.push('an attached diff');
    if (hits.length === 0) {
      return { questionId: q.id, answer: false, confidence: 0.6, rationale: 'Nothing in your description points this way.', setBy: 'intake' };
    }
    const first = hits[0]?.trim() ?? '';
    return {
      questionId: q.id,
      answer: true,
      confidence: Math.min(0.95, 0.6 + 0.15 * hits.length),
      rationale: first.startsWith('an ') ? `You attached ${first.slice(3)}.` : `Your description mentions “${first}”.`,
      setBy: 'intake',
    };
  });
}

function scaled(base: CostEstimate, factor: number): CostEstimate {
  const r = (n: number) => Math.round(n * factor * 100) / 100;
  return { ...base, lowUsd: r(base.lowUsd), highUsd: r(base.highUsd) };
}

function familyId(recipe: Recipe): string {
  return recipe.family.toLowerCase();
}

function requireRecipe(id: string): Recipe {
  const recipe = demoRecipes.get(id);
  if (!recipe) throw new Error(`unknown recipe ${id}`);
  return recipe;
}

function requirePresentation(id: string): RecipePresentation {
  const p = presentationFor(id);
  if (!p) throw new Error(`no presentation for ${id}`);
  return p;
}

/** The composed variant: the nearest recipe with its outside critique capped at two rounds. */
function capCritique(node: Node): Node {
  switch (node.op) {
    case 'step':
      return node.block === 'CRITIC' ? { ...node, knobs: { ...(node.knobs ?? {}), maxRounds: 2 } } : node;
    case 'seq':
      return { ...node, steps: node.steps.map(capCritique) };
    case 'replicate':
    case 'each':
    case 'loop':
    case 'optional':
      return { ...node, body: capCritique(node.body) };
    case 'route':
      return { ...node, branches: node.branches.map((b) => ({ ...b, body: capCritique(b.body) })) };
    case 'pick':
      return node;
  }
}

export function createDemoAdvisor(): Advisor {
  const advisor: Advisor = {
    questions: () => QUESTIONS.map((q) => ({ ...q })),

    async recommend(problem, opts) {
      const auto = intake(problem);
      const answers = QUESTIONS.map((q, i): ChooserAnswer => {
        const given = opts.answers?.find((a) => a.questionId === q.id);
        if (!given) return auto[i] as ChooserAnswer;
        return given.setBy === 'user' ? { ...given, confidence: 1 } : given;
      });
      const yes = QUESTIONS.filter((q, i) => answers[i]?.answer);
      const deciding = yes[0];
      const recipeId = deciding?.routesTo ?? 'c4';
      const decidingAnswer = answers.find((a) => a.questionId === deciding?.id);
      const fit: Recommendation['fit'] = !deciding ? 'none' : (decidingAnswer?.confidence ?? 0) >= STRONG ? 'strong' : 'partial';
      const presentation = requirePresentation(recipeId);
      const recipe = requireRecipe(recipeId);
      return {
        recipeId,
        recipeHash: recipe.hash ?? '',
        presentation,
        fit,
        why: deciding
          ? `${WHY[recipeId] ?? ''} ${decidingAnswer?.rationale ?? ''}`.trim()
          : 'None of the seven questions matched clearly. Memo Polish is the general fallback for everyday documents; you can also build your own recipe.',
        answers,
        label: advisor.label(recipe),
        routing: 'untested',
        alternatives: yes.slice(1, 3).map((q) => ({
          recipeId: q.routesTo,
          name: presentationFor(q.routesTo)?.name ?? q.routesTo,
          why: `You also answered yes to “${q.text}”`,
        })),
        estimate: advisor.estimate(recipe, opts.profileId),
        composeSuggested: fit === 'none',
        routes: {},
      };
    },

    async compose(problem, opts) {
      const rec = await advisor.recommend(problem, opts);
      const nearest = requireRecipe(rec.recipeId);
      const draft: Recipe = {
        ...nearest,
        id: `composed-${rec.recipeId}-${hashOf(problem.text).toString(16).slice(0, 6)}`,
        title: `Your recipe, from ${rec.presentation.name}`,
        kind: 'composed',
        channel: 'workspace',
        stages: nearest.stages.map((s) => ({ ...s, body: capCritique(s.body) })),
      };
      const recipe = withHash(draft);
      const presentation: RecipePresentation = {
        ...rec.presentation,
        recipeId: recipe.id,
        code: `${rec.presentation.code}+`,
        name: `Your recipe, from ${rec.presentation.name}`,
      };
      const result: ComposeResult = {
        recipe,
        ok: true,
        violations: [],
        nearestRecipeId: rec.recipeId,
        diff: [
          `Starts from ${rec.presentation.name}.`,
          'Outside critique stops after at most 2 rounds instead of 5, which lowers the cost.',
          'Every step that is yours stays yours.',
        ],
        label: advisor.label(recipe),
        presentation,
        estimate: scaled(advisor.estimate(recipe, opts.profileId), 0.85),
      };
      return result;
    },

    catalog: () => PRESENTATIONS.map((p) => structuredClone(p)),

    label: (recipe) => (recipe.kind === 'composed' ? { ...COMPOSED } : { ...UNTESTED }),

    estimate(recipe, profileId) {
      const base = ESTIMATES[familyId(recipe)] ?? ESTIMATES.c4;
      if (!base) throw new Error('missing estimates');
      return scaled(base, PROFILE_PRICE_SCALE[profileId] ?? 1);
    },
  };
  return advisor;
}
