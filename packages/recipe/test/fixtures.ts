import type { Recipe } from '../src/index.ts';

/** A small valid recipe: one plain build in D1. */
export function minimalRecipe(): Recipe {
  return {
    schema: 'byway.recipe/1',
    id: 'minimal',
    title: 'Minimal',
    kind: 'baseline',
    family: 'baseline',
    channel: 'protocol',
    inputs: ['intent'],
    stages: [
      {
        stage: 'D1',
        body: {
          op: 'step',
          id: 'build',
          role: 'build',
          actor: 'model',
          tier: 'mid',
          prompt: 'article.B1',
          consumes: ['intent'],
          produces: ['artifact'],
          writes: true,
        },
      },
    ],
    sitsOut: [],
    exceptions: [],
    bank: false,
  };
}
