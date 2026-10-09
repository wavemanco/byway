import { feedsGate, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';

export interface FlowOps<S> {
  /**
   * Apply one step to the state. May record findings. `contained` says the step sits in an audit lens, a one-shot
   * gate's body or a pick's judge, where its output never reaches the work (@byway/recipe semantics).
   */
  step(step: Step, path: string, stage: Stage['stage'], state: S, contained: boolean): S;
  /** Combine the states of alternative paths (route branches, optional ran or skipped, loop iterations, loop exits). */
  join(states: S[]): S;
}

/** The exit points of the loop being walked, and the states right after each of them. */
interface LoopExits<S> {
  metric: string;
  states: S[];
}

/**
 * Walk a recipe along its control flow, carrying a state: the one flow walk every path rule reads (PR6, ST12, the
 * composed profile's writer counts; ADR-0092). Routes and optionals fork and join; a loop body (and a relay link) runs
 * twice, so effects that reach the next iteration through the back-edge are seen; per-candidate bodies (replicate,
 * each) join with the state before them; audit lenses fork from one state and join.
 *
 * Exit-aware: a loop's gate may end its body right after a step that reports to it (an exit point: a model critic
 * under a critic gate, a model check under a check-clean gate, reached through seq, relay, route and optional), so the
 * state after every exit point also reaches the loop's exit, and the rest of that round may not have run. May-analyses
 * are unchanged by this (an exit state is a prefix of the continuing path); must-analyses become sound.
 *
 * Containment: steps in an audit lens, a one-shot gate's body or a pick's judge are passed `contained = true`, and
 * nothing inside them reports to an enclosing loop (the interpreter runs them without the loop's context). Callers
 * record findings idempotently (the second loop pass repeats them).
 */
export function flowRecipe<S>(recipe: Recipe, initial: S, ops: FlowOps<S>): S {
  let state = initial;
  recipe.stages.forEach((s, i) => {
    state = flowNode(s.body, state, `stages[${i}].body`, s.stage, ops, false, undefined);
  });
  return state;
}

function flowNode<S>(node: Node, state: S, path: string, stage: Stage['stage'], ops: FlowOps<S>, contained: boolean, loop: LoopExits<S> | undefined): S {
  switch (node.op) {
    case 'step': {
      const out = ops.step(node, path, stage, state, contained);
      if (loop && feedsGate(node, loop.metric)) loop.states.push(out);
      return out;
    }
    case 'seq':
      return node.steps.reduce((s, child, i) => flowNode(child, s, `${path}.steps[${i}]`, stage, ops, contained, loop), state);
    case 'replicate':
    case 'each':
      // Candidates run without the loop's context: a critic in one does not report to an enclosing loop.
      return ops.join([state, flowNode(node.body, state, `${path}.body`, stage, ops, contained, undefined)]);
    case 'loop': {
      const own: LoopExits<S> = { metric: node.gate.metric, states: [] };
      const first = flowNode(node.body, state, `${path}.body`, stage, ops, contained, own);
      const second = flowNode(node.body, ops.join([state, first]), `${path}.body`, stage, ops, contained, own);
      return ops.join([first, second, ...own.states]);
    }
    case 'relay': {
      // A relay chain repeats its link like a loop body, so effects cross from one link to the next. It hands the
      // enclosing loop's context on, so a check inside a link can end that loop's round part-way through the chain.
      const first = flowNode(node.body, state, `${path}.body`, stage, ops, contained, loop);
      const second = flowNode(node.body, ops.join([state, first]), `${path}.body`, stage, ops, contained, loop);
      return ops.join([first, second]);
    }
    case 'audit':
      // Lenses run side by side on the same input, and only annotate.
      return ops.join(node.lenses.map((l, i) => flowNode(l.body, state, `${path}.lenses[${i}].body`, stage, ops, true, undefined)));
    case 'gate':
      // A retry re-runs its stage from that stage's own entry state, so it adds no back-edge here.
      return flowNode(node.body, state, `${path}.body`, stage, ops, true, undefined);
    case 'optional':
      return ops.join([state, flowNode(node.body, state, `${path}.body`, stage, ops, contained, loop)]);
    case 'route':
      return ops.join(node.branches.map((b, i) => flowNode(b.body, state, `${path}.branches[${i}].body`, stage, ops, contained, loop)));
    case 'pick':
      return node.judge ? ops.step(node.judge, `${path}.judge`, stage, state, true) : state;
  }
}
