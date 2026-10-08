import type { Node, Recipe, Stage, Step } from './schema.ts';

export type Visitor = (node: Node, path: string, stage: Stage['stage']) => void;

/** Depth-first, pre-order walk over every node, including pick judges and audit lenses. */
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
    case 'gate':
    case 'relay':
      walkNode(node.body, `${path}.body`, stage, visit);
      break;
    case 'route':
      node.branches.forEach((b, i) => walkNode(b.body, `${path}.branches[${i}].body`, stage, visit));
      break;
    case 'audit':
      node.lenses.forEach((l, i) => walkNode(l.body, `${path}.lenses[${i}].body`, stage, visit));
      break;
    case 'pick':
      if (node.judge) walkNode(node.judge, `${path}.judge`, stage, visit);
      break;
    case 'step':
      break;
  }
}

/** The direct children of a node (pick judges included), for code that recurses without caring about the operator. */
export function children(node: Node): Node[] {
  switch (node.op) {
    case 'step':
      return [];
    case 'seq':
      return node.steps;
    case 'route':
      return node.branches.map((b) => b.body);
    case 'audit':
      return node.lenses.map((l) => l.body);
    case 'pick':
      return node.judge ? [node.judge] : [];
    default:
      return [node.body];
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

/** Every node strictly inside a node of the given operator (e.g. every node inside an audit lens). */
export function nodesInside(recipe: Recipe, op: Node['op']): Set<Node> {
  const inside = new Set<Node>();
  const mark = (n: Node): void => {
    for (const c of children(n)) {
      inside.add(c);
      mark(c);
    }
  };
  walk(recipe, (node) => {
    if (node.op === op) mark(node);
  });
  return inside;
}
