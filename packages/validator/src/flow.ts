import { feedsGate, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';

export interface FlowOps<S> {
  /**
   * Apply one step to the state. May record findings. `contained` says the step sits in an audit lens, a one-shot
   * gate's body or a pick's judge, where its output never reaches the work (@byway/recipe semantics).
   */
  step(step: Step, path: string, stage: Stage['stage'], state: S, contained: boolean): S;
  /** Combine the states of alternative paths (route branches, optional ran or skipped, loop iterations, loop exits). */
  join(states: S[]): S;
  /**
   * An exact key of a state: two states with the same key are the same to `step` and `join`. With it, a node walked
   * again from a state with a key already seen there is answered from the first walk (its findings were recorded then),
   * so nested loops cost a bounded number of walks per node instead of doubling with each level. Without it, every
   * walk is made.
   */
  key?(state: S): string;
}

/** The exit points of the loop being walked, and the states right after each of them. */
interface LoopExits<S> {
  metric: string;
  states: S[];
}

/** What a node's walk from one state gave: the state after it, and the states it sent to the enclosing loop's exit. */
interface Walked<S> {
  out: S;
  exits: S[];
}

interface Walk<S> {
  ops: FlowOps<S>;
  /** By path, containment, the enclosing loop's metric and the state's key; undefined when the walk is not memoized. */
  memo: Map<string, Walked<S>> | undefined;
}

/** Off only inside withoutFlowMemo. */
let memoOn = true;

/**
 * Run `fn` with the flow walk unmemoized: every walk made, as before memoizing. It exists for the test that holds the
 * memoized walk to the full one (flow-memo.test.ts).
 */
export function withoutFlowMemo<T>(fn: () => T): T {
  const was = memoOn;
  memoOn = false;
  try {
    return fn();
  } finally {
    memoOn = was;
  }
}

/**
 * Walk a recipe along its control flow, carrying a state: the one flow walk every path rule reads (PR6, ST12, DR7, the
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
 *
 * Memoized when the ops give a state key: a step's result and findings depend only on the step, its path, its stage,
 * the state and its containment, so a node walked again from an equal state, under the same enclosing loop, gives what
 * it gave the first time, and is not walked again (flow-memo.test.ts holds it to the full walk on random recipes).
 */
export function flowRecipe<S>(recipe: Recipe, initial: S, ops: FlowOps<S>): S {
  const walk: Walk<S> = { ops, memo: ops.key && memoOn ? new Map() : undefined };
  let state = initial;
  recipe.stages.forEach((s, i) => {
    state = flowNode(walk, s.body, state, `stages[${i}].body`, s.stage, false, undefined);
  });
  return state;
}

function flowNode<S>(walk: Walk<S>, node: Node, state: S, path: string, stage: Stage['stage'], contained: boolean, loop: LoopExits<S> | undefined): S {
  if (!walk.memo) return flowOnce(walk, node, state, path, stage, contained, loop);
  const key = `${path}|${contained ? 1 : 0}|${loop?.metric ?? ''}|${walk.ops.key!(state)}`;
  const known = walk.memo.get(key);
  if (known) {
    loop?.states.push(...known.exits);
    return known.out;
  }
  const before = loop?.states.length ?? 0;
  const out = flowOnce(walk, node, state, path, stage, contained, loop);
  walk.memo.set(key, { out, exits: loop ? loop.states.slice(before) : [] });
  return out;
}

function flowOnce<S>(walk: Walk<S>, node: Node, state: S, path: string, stage: Stage['stage'], contained: boolean, loop: LoopExits<S> | undefined): S {
  const { ops } = walk;
  switch (node.op) {
    case 'step': {
      const out = ops.step(node, path, stage, state, contained);
      if (loop && feedsGate(node, loop.metric)) loop.states.push(out);
      return out;
    }
    case 'seq':
      return node.steps.reduce((s, child, i) => flowNode(walk, child, s, `${path}.steps[${i}]`, stage, contained, loop), state);
    case 'replicate':
    case 'each':
      // Candidates run without the loop's context: a critic in one does not report to an enclosing loop.
      return ops.join([state, flowNode(walk, node.body, state, `${path}.body`, stage, contained, undefined)]);
    case 'loop': {
      const own: LoopExits<S> = { metric: node.gate.metric, states: [] };
      const first = flowNode(walk, node.body, state, `${path}.body`, stage, contained, own);
      const second = flowNode(walk, node.body, ops.join([state, first]), `${path}.body`, stage, contained, own);
      return ops.join([first, second, ...own.states]);
    }
    case 'relay': {
      // A relay chain repeats its link like a loop body, so effects cross from one link to the next. It hands the
      // enclosing loop's context on, so a check inside a link can end that loop's round part-way through the chain.
      const first = flowNode(walk, node.body, state, `${path}.body`, stage, contained, loop);
      const second = flowNode(walk, node.body, ops.join([state, first]), `${path}.body`, stage, contained, loop);
      return ops.join([first, second]);
    }
    case 'audit':
      // Lenses run side by side on the same input, and only annotate.
      return ops.join(node.lenses.map((l, i) => flowNode(walk, l.body, state, `${path}.lenses[${i}].body`, stage, true, undefined)));
    case 'gate':
      // A retry re-runs its stage from that stage's own entry state, so it adds no back-edge here.
      return flowNode(walk, node.body, state, `${path}.body`, stage, true, undefined);
    case 'optional':
      return ops.join([state, flowNode(walk, node.body, state, `${path}.body`, stage, contained, loop)]);
    case 'route':
      return ops.join(node.branches.map((b, i) => flowNode(walk, b.body, state, `${path}.branches[${i}].body`, stage, contained, loop)));
    case 'pick':
      return node.judge ? ops.step(node.judge, `${path}.judge`, stage, state, true) : state;
  }
}
