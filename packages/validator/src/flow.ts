import type { Node, Recipe, Stage, Step } from '@byway/recipe';

export interface FlowOps<S> {
  /** Apply one step to the state. May record findings. */
  step(step: Step, path: string, stage: Stage['stage'], state: S): S;
  /** Combine the states of alternative paths (route branches, optional ran or skipped, loop iterations). */
  join(states: S[]): S;
}

/**
 * Walk a recipe along its control flow, carrying a state. Routes and optionals fork and join; a loop body (and a relay
 * link) runs twice, so effects that reach the next iteration through the back-edge are seen; per-candidate bodies
 * (replicate, each) join with the state before them; audit lenses fork from one state and join. Callers record
 * findings idempotently (the second loop pass repeats them).
 */
export function flowRecipe<S>(recipe: Recipe, initial: S, ops: FlowOps<S>): S {
  let state = initial;
  recipe.stages.forEach((s, i) => {
    state = flowNode(s.body, state, `stages[${i}].body`, s.stage, ops);
  });
  return state;
}

function flowNode<S>(node: Node, state: S, path: string, stage: Stage['stage'], ops: FlowOps<S>): S {
  switch (node.op) {
    case 'step':
      return ops.step(node, path, stage, state);
    case 'seq':
      return node.steps.reduce((s, child, i) => flowNode(child, s, `${path}.steps[${i}]`, stage, ops), state);
    case 'replicate':
    case 'each':
      return ops.join([state, flowNode(node.body, state, `${path}.body`, stage, ops)]);
    case 'loop':
    case 'relay': {
      // A relay chain repeats its link like a loop body, so effects cross from one link to the next.
      const first = flowNode(node.body, state, `${path}.body`, stage, ops);
      const second = flowNode(node.body, ops.join([state, first]), `${path}.body`, stage, ops);
      return ops.join([first, second]);
    }
    case 'audit':
      // Lenses run side by side on the same input.
      return ops.join(node.lenses.map((l, i) => flowNode(l.body, state, `${path}.lenses[${i}].body`, stage, ops)));
    case 'gate':
      // A retry re-runs its stage from that stage's own entry state, so it adds no back-edge here.
      return flowNode(node.body, state, `${path}.body`, stage, ops);
    case 'optional':
      return ops.join([state, flowNode(node.body, state, `${path}.body`, stage, ops)]);
    case 'route':
      return ops.join(node.branches.map((b, i) => flowNode(b.body, state, `${path}.branches[${i}].body`, stage, ops)));
    case 'pick':
      return node.judge ? ops.step(node.judge, `${path}.judge`, stage, state) : state;
  }
}
