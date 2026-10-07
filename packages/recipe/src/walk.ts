import type { Node, Recipe, Stage, Step } from './schema.ts';

export type Visitor = (node: Node, path: string, stage: Stage['stage']) => void;

/** Depth-first, pre-order walk over every node, including pick judges. */
export function walk(recipe: Recipe, visit: Visitor): void {
  recipe.stages.forEach((s, i) => walkNode(s.body, `stages[${i}].body`, s.stage, visit));
}

export function walkNode(node: Node, path: string, stage: Stage['stage'], visit: Visitor): void {
  visit(node, path, stage);
  switch (node.op) {
    case 'seq':
      node.steps.forEach((child, i) => walkNode(child, `${path}.steps[${i}]`, stage, visit));
      break;
    case 'replicate':
    case 'each':
    case 'loop':
    case 'optional':
      walkNode(node.body, `${path}.body`, stage, visit);
      break;
    case 'route':
      node.branches.forEach((b, i) => walkNode(b.body, `${path}.branches[${i}].body`, stage, visit));
      break;
    case 'pick':
      if (node.judge) walkNode(node.judge, `${path}.judge`, stage, visit);
      break;
    case 'step':
      break;
  }
}

/** Every step in the recipe, with its path and stage. */
export function steps(recipe: Recipe): { step: Step; path: string; stage: Stage['stage'] }[] {
  const out: { step: Step; path: string; stage: Stage['stage'] }[] = [];
  walk(recipe, (node, path, stage) => {
    if (node.op === 'step') out.push({ step: node, path, stage });
  });
  return out;
}
