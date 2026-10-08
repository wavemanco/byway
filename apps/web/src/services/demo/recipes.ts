/**
 * Demo recipes as `byway.recipe/1` objects, built from the demo scripts so the runner and the IR agree on every
 * step id (and so the presentations' stepIds can be checked against them). These are stand-ins: flat step lists,
 * with an `optional` operator where a script asks before a step, but no replicate, loops or routes; the real
 * recipes come from @byway/catalog. They are on the `product` channel so they can never be mistaken for protocol
 * or research recipes. Their inputs mirror the canonical recipes', so a recipe that takes your examples (`refs`)
 * here takes them in the real catalog too.
 */
import { optional, seq, step, withHash, type Node, type Recipe } from '@byway/recipe';
import { SCRIPTS } from './scripts.ts';
import type { Script, ScriptStep, StageCode } from './script.ts';

const ACTOR = { you: 'human', ai: 'model', tool: 'tool' } as const;

function nodeFor(s: ScriptStep): Node {
  const node = step({
    id: s.id,
    role: s.role,
    ...(s.block ? { block: s.block } : {}),
    ...(s.glue ? { glue: s.glue } : {}),
    actor: ACTOR[s.who],
    consumes: [],
    produces: [],
    ...(s.critic ? { knobs: { mode: s.critic } } : {}),
  });
  return s.optional ? optional(s.optional.id, s.optional.trigger, node) : node;
}

export function recipeFromScript(script: Script): Recipe {
  const stages = (['D1', 'D2', 'D3'] as StageCode[])
    .map((stage) => ({ stage, nodes: script.steps.filter((s) => s.stage === stage).map(nodeFor) }))
    .filter((s) => s.nodes.length > 0)
    .map(({ stage, nodes }) => ({ stage, body: seq(...nodes) }));

  return withHash({
    schema: 'byway.recipe/1',
    id: script.recipeId,
    title: `${script.title} (demo)`,
    kind: 'protocol-config',
    family: script.family,
    channel: 'product',
    medium: script.medium,
    inputs: ['intent', ...script.inputs],
    stages,
    sitsOut: [],
    exceptions: [],
    bank: true,
  });
}

const RECIPES: readonly Recipe[] = SCRIPTS.map(recipeFromScript);

/** The demo recipes by id; only the demo advisor and tests use this (screens go through Advisor.recipe). */
export const demoRecipes = {
  get: (id: string): Recipe | undefined => {
    const recipe = RECIPES.find((r) => r.id === id);
    return recipe ? structuredClone(recipe) : undefined;
  },
  list: (): Recipe[] => RECIPES.map((r) => structuredClone(r)),
};
