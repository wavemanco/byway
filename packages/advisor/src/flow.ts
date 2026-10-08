import type { Node, Recipe, Step } from '@byway/recipe';

/**
 * Which steps can run after a marked step on some path through a recipe, along its control flow. It follows the same
 * reading as the validator's PR6 walk (which @byway/validator does not export): a route or optional forks and joins, a
 * loop body and a relay link run twice (so a step early in a loop counts as after a mark later in it, for the next
 * round), replicate and each bodies join with the state before them, audit lenses fork from one state, a gate's retry
 * adds no back-edge, and a pick's judge is a step.
 */
export function stepsAfter(recipe: Recipe, mark: (s: Step) => boolean): { step: Step; path: string }[] {
  const found = new Map<string, { step: Step; path: string }>();
  const visit = (n: Node, seen: boolean, path: string): boolean => {
    switch (n.op) {
      case 'step':
        if (seen && !found.has(path)) found.set(path, { step: n, path });
        return seen || mark(n);
      case 'seq':
        return n.steps.reduce((s, c, i) => visit(c, s, `${path}.steps[${i}]`), seen);
      case 'replicate':
      case 'each':
        return visit(n.body, seen, `${path}.body`) || seen;
      case 'loop':
      case 'relay': {
        const first = visit(n.body, seen, `${path}.body`);
        return visit(n.body, seen || first, `${path}.body`) || first;
      }
      case 'audit':
        return n.lenses.map((l, i) => visit(l.body, seen, `${path}.lenses[${i}].body`)).some(Boolean);
      case 'gate':
        return visit(n.body, seen, `${path}.body`);
      case 'optional':
        return visit(n.body, seen, `${path}.body`) || seen;
      case 'route':
        return n.branches.map((b, i) => visit(b.body, seen, `${path}.branches[${i}].body`)).some(Boolean);
      case 'pick':
        return n.judge ? visit(n.judge, seen, `${path}.judge`) : seen;
    }
  };
  recipe.stages.reduce((seen, s, i) => visit(s.body, seen, `stages[${i}].body`), false);
  return [...found.values()];
}
