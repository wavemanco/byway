import { OPTION_SET, type PortType } from '@byway/protocol';
import { personWrite, walkNode, type Actor, type Audit, type Node, type Recipe, type RelayChain, type Role, type Stage, type Step } from '@byway/recipe';
import { ANNOTATION_PORTS, Findings } from './context.ts';

/** Who may have produced a port: a recipe input, a step (with its role and actor) or an operator. */
export interface Producer {
  kind: 'input' | 'step' | 'operator';
  role?: Role;
  actor?: Actor;
  op?: 'replicate' | 'each' | 'pick';
}

/**
 * Typing state at a point in the recipe.
 * - `must`: ports present on every path, each with every producer that may have made it (for ST5 and provenance rules).
 * - `may`: ports present on at least one path (for "may still be open" rules such as PR4 and DR2).
 * - `aside`: ports a person's write set aside on some path, with that write's step id (ADR-0092). A finished person's
 *   write sets the option set aside: picking from it, or working on it, would bring back what was made before their
 *   words. It stays in `may` (the runner still holds it), but no longer in `must`.
 * - `held`: on some path the runner still holds an option list though no option set is open: a pick of one leaves
 *   ports.options as the one it chose (the interpreter's pick), and a later pick or each takes that list. A person's
 *   write sets it aside like an open set.
 */
export interface ScopeState {
  must: ReadonlyMap<PortType, readonly Producer[]>;
  may: ReadonlySet<PortType>;
  aside: ReadonlyMap<PortType, string>;
  held: boolean;
}

export interface Typing {
  stageEntry: Map<Stage['stage'], ScopeState>;
  nodeEntry: Map<Node, ScopeState>;
}

interface MutableState {
  must: Map<PortType, Producer[]>;
  may: Set<PortType>;
  aside: Map<PortType, string>;
  held: boolean;
}

const clone = (s: ScopeState): MutableState => ({
  must: new Map([...s.must].map(([k, v]) => [k, [...v]])),
  may: new Set(s.may),
  aside: new Map(s.aside),
  held: s.held,
});

/** ST5 for a consumed option set that is not in scope: 'set-aside' when a person's write set it aside. */
function missingOptions(st: ScopeState, path: string, what: string, findings: Findings): void {
  const by = st.aside.get(OPTION_SET);
  if (by) findings.add('ST5', path, `${what} ${OPTION_SET}, which "${by}", a person's write, set aside: it would bring back what was made before their words`, 'set-aside');
  else findings.add('ST5', path, `${what} ${OPTION_SET}, which is not in scope on every path`);
}

function addProducers(list: Producer[], more: readonly Producer[]): Producer[] {
  const out = [...list];
  for (const p of more) {
    if (!out.some((q) => q.kind === p.kind && q.role === p.role && q.actor === p.actor && q.op === p.op)) out.push(p);
  }
  return out;
}

/** Ports guaranteed after one of several alternative paths: present on all of them, with every possible producer. */
function mergeAlternatives(states: ScopeState[]): MutableState {
  const [first, ...rest] = states;
  const must = new Map<PortType, Producer[]>();
  const may = new Set<PortType>();
  const aside = new Map<PortType, string>();
  if (!first) return { must, may, aside, held: false };
  for (const [port, producers] of first.must) {
    if (rest.every((s) => s.must.has(port))) {
      must.set(port, rest.reduce((acc, s) => addProducers(acc, s.must.get(port) ?? []), [...producers]));
    }
  }
  for (const s of states) for (const p of s.may) may.add(p);
  for (const s of states) for (const [p, by] of s.aside) if (!aside.has(p)) aside.set(p, by);
  return { must, may, aside, held: states.some((s) => s.held) };
}

/** Type the recipe's port flow (spec: "Scope typing"). Emits ST5 for consumed ports that are not guaranteed in scope. */
export function typeRecipe(recipe: Recipe, findings: Findings): Typing {
  const typing: Typing = { stageEntry: new Map(), nodeEntry: new Map() };
  let state: ScopeState = {
    must: new Map(recipe.inputs.map((p) => [p, [{ kind: 'input' } as Producer]])),
    may: new Set(recipe.inputs),
    aside: new Map(),
    held: false,
  };
  recipe.stages.forEach((s, i) => {
    typing.stageEntry.set(s.stage, clone(state));
    state = typeNode(s.body, state, `stages[${i}].body`, typing, findings);
  });
  return typing;
}

function typeNode(node: Node, input: ScopeState, path: string, typing: Typing, findings: Findings): ScopeState {
  typing.nodeEntry.set(node, clone(input));
  const st = clone(input);
  switch (node.op) {
    case 'step': {
      for (const port of node.consumes) {
        if (st.must.has(port)) continue;
        if (port === OPTION_SET) missingOptions(st, path, `step "${node.id}" consumes`, findings);
        else findings.add('ST5', path, `step "${node.id}" consumes ${port}, which is not in scope on every path`);
      }
      for (const port of node.produces) {
        st.must.set(port, [{ kind: 'step', role: node.role, actor: node.actor }]);
        st.may.add(port);
        st.aside.delete(port);
      }
      setAside(node, st);
      return st;
    }
    case 'seq': {
      let s: ScopeState = st;
      node.steps.forEach((child, i) => {
        s = typeNode(child, s, `${path}.steps[${i}]`, typing, findings);
      });
      return s;
    }
    case 'replicate': {
      const out = typeNode(node.body, st, `${path}.body`, typing, findings);
      if (!out.must.has('artifact')) findings.add('ST5', path, `replicate "${node.id}" body produces no artifact`);
      st.must.set(OPTION_SET, [{ kind: 'operator', op: 'replicate' }]);
      st.may.add(OPTION_SET);
      st.aside.delete(OPTION_SET);
      return st;
    }
    case 'each': {
      if (!st.must.has(OPTION_SET)) missingOptions(st, path, `each "${node.id}" needs`, findings);
      const inner = clone(st);
      inner.must.set('artifact', [{ kind: 'operator', op: 'each' }]);
      inner.may.add('artifact');
      typeNode(node.body, inner, `${path}.body`, typing, findings);
      return st;
    }
    case 'pick': {
      if (!st.must.has(OPTION_SET)) missingOptions(st, path, `pick "${node.id}" needs`, findings);
      if (node.judge) {
        // The harness renders every option for the selector.
        const judgeScope = clone(st);
        judgeScope.must.set('view', [{ kind: 'step', role: 'render', actor: 'tool' }]);
        judgeScope.may.add('view');
        typeNode(node.judge, judgeScope, `${path}.judge`, typing, findings);
      }
      if (node.k === 1) {
        // The choice is made: no option set is open. The runner still holds the one chosen as its option list.
        st.must.delete(OPTION_SET);
        st.may.delete(OPTION_SET);
        st.aside.delete(OPTION_SET);
        st.held = true;
        st.must.set('artifact', [{ kind: 'operator', op: 'pick' }]);
        st.may.add('artifact');
      }
      return st;
    }
    case 'loop': {
      // Typed once: ports must be available on the first iteration (ST5). Back-edge effects are checked by the path
      // rules, and a set-aside reached again through the back-edge here.
      const out = typeNode(node.body, st, `${path}.body`, typing, findings);
      setAsideAgain(node.body, mergeAlternatives([st, out]), `${path}.body`, `loop "${node.id}"`, findings);
      return out;
    }
    case 'optional': {
      const ran = typeNode(node.body, st, `${path}.body`, typing, findings);
      return mergeAlternatives([st, ran]);
    }
    case 'route':
      return mergeAlternatives(node.branches.map((b, i) => typeNode(b.body, st, `${path}.branches[${i}].body`, typing, findings)));
    case 'audit':
      return typeAudit(node, st, path, typing, findings);
    case 'gate':
      // The check's outputs (its view, critique and score) stay in scope after it, as after any step sequence.
      return typeNode(node.body, st, `${path}.body`, typing, findings);
    case 'relay': {
      // Typed once, like a loop body: the first link starts from the anchor in scope before the chain.
      const out = typeNode(node.body, st, `${path}.body`, typing, findings);
      checkRelayLink(node, st, path, findings);
      setAsideAgain(node.body, mergeAlternatives([st, out]), `${path}.body`, `relay "${node.id}"`, findings);
      return out;
    }
  }
}

/** A finished person's write sets the option set aside (it stays in `may`: the runner still holds it). */
function setAside(step: Step, st: MutableState): void {
  if (!personWrite(step) || !(st.may.has(OPTION_SET) || st.held)) return;
  st.must.delete(OPTION_SET);
  st.aside.set(OPTION_SET, step.id);
}

/**
 * The second round of a loop body (or the next relay link) starts from what the first left: an option consumer there
 * may read options a person's write later in the body set aside. Only those findings are kept (ST12 'set-aside'); every
 * other port rule is checked on the first round, as before.
 */
function setAsideAgain(body: Node, entry: ScopeState, path: string, what: string, findings: Findings): void {
  const again = new Findings();
  typeNode(body, entry, path, { stageEntry: new Map(), nodeEntry: new Map() }, again);
  const first = new Set(findings.list.filter((f) => f.clause === 'set-aside').map((f) => f.path));
  for (const f of again.list) {
    if (f.ruleId !== 'ST5' || f.clause !== 'set-aside' || first.has(f.path)) continue;
    findings.add('ST12', f.path, `${f.message} (on a later round of ${what})`, 'set-aside');
  }
}

/** Ports any step inside a node produces. */
function producedWithin(node: Node): Set<PortType> {
  const made = new Set<PortType>();
  walkNode(node, '', 'D1', (n) => {
    if (n.op === 'step') for (const p of n.produces) made.add(p);
  });
  return made;
}

/**
 * Every lens starts from the same input. After the audit only annotations come out: a port in ANNOTATION_PORTS that
 * a lens makes on every one of its paths is in scope, with every lens that made it as a producer. Anything else a
 * lens makes (its own renders, a vanilla control set) stays inside it.
 */
function typeAudit(node: Audit, st: MutableState, path: string, typing: Typing, findings: Findings): ScopeState {
  const entry = clone(st);
  const fromLenses = new Map<PortType, Producer[]>();
  node.lenses.forEach((lens, i) => {
    const out = typeNode(lens.body, entry, `${path}.lenses[${i}].body`, typing, findings);
    const made = producedWithin(lens.body);
    for (const port of ANNOTATION_PORTS) {
      if (!made.has(port)) continue;
      st.may.add(port);
      const producers = out.must.get(port);
      if (producers) fromLenses.set(port, addProducers(fromLenses.get(port) ?? [], producers));
    }
  });
  for (const [port, producers] of fromLenses) st.must.set(port, producers);
  return st;
}

/**
 * ST11: a relay link starts from the previous link's exact end state and hands one on. It must read `anchor`, and it
 * must make a new one on every path; the anchor it started from does not count, so the link is typed again without it.
 */
function checkRelayLink(node: RelayChain, st: MutableState, path: string, findings: Findings): void {
  let reads = false;
  walkNode(node.body, '', 'D1', (n) => {
    if (n.op === 'step' && n.consumes.includes('anchor')) reads = true;
  });
  if (!reads) findings.add('ST11', path, `relay "${node.id}" link does not start from the previous link's anchor`, 'no-anchor-in');
  const withoutAnchor = clone(st);
  withoutAnchor.must.delete('anchor');
  const scratch: Typing = { stageEntry: new Map(), nodeEntry: new Map() };
  const probe = typeNode(node.body, withoutAnchor, path, scratch, new Findings());
  if (!probe.must.has('anchor')) findings.add('ST11', path, `relay "${node.id}" link does not hand on an anchor on every path`, 'no-anchor-out');
}
