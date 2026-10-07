/**
 * Demo recipes as `byway.recipe/1` objects, built from the demo scripts so the runner and the IR agree.
 * These are stand-ins with flat step lists; the real recipes (with replicate, loops, routes and declared
 * exceptions) come from @byway/catalog. They are on the `product` channel so they can never be mistaken
 * for protocol or research recipes.
 */
import { seq, step, withHash, type Node, type Recipe } from '@byway/recipe';
import type { RecipeSource } from '../types.ts';
import { SCRIPTS } from './scripts.ts';
import type { Script, StageCode } from './script.ts';

const ACTOR = { you: 'human', ai: 'model', tool: 'tool' } as const;

export function recipeFromScript(script: Script): Recipe {
  const stages = (['D1', 'D2', 'D3'] as StageCode[])
    .map((stage) => {
      const nodes: Node[] = script.steps
        .filter((s) => s.stage === stage)
        .map((s) =>
          step({
            id: s.id,
            role: s.role,
            ...(s.block ? { block: s.block } : {}),
            ...(s.glue ? { glue: s.glue } : {}),
            actor: ACTOR[s.who],
            consumes: [],
            produces: [],
          }),
        );
      return { stage, nodes };
    })
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
    inputs: ['intent'],
    stages,
    sitsOut: [],
    exceptions: [],
    bank: true,
  });
}

const RECIPES: Recipe[] = SCRIPTS.map(recipeFromScript);

export const demoRecipes: RecipeSource = {
  get: (id) => RECIPES.find((r) => r.id === id),
  list: () => [...RECIPES],
};
