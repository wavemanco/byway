import { OPTION_SET, type PortType, type RuleId } from '@byway/protocol';
import { personWrite, walkNode, type Actor, type Audit, type Node, type Recipe, type RelayChain, type Role, type Stage, type Step } from '@byway/recipe';
import { Findings } from './context.ts';

/** What comes out of an audit: its lenses' critiques, joined (runner interpreter audit). */
const AUDIT_OUT = ['critique'] as const;

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

/** How much typing a recipe took: node visits, counting none for a re-typing whose answer was already known. */
export interface TypingStats {
  visits: number;
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

/** Where findings go: the recipe's findings on the first round; a later round keeps only its set-asides. */
interface Sink {
  add(ruleId: RuleId, path: string, message: string, clause?: string): void;
}

/** ST5 for a consumed option set that is not in scope: 'set-aside' when a person's write set it aside. */
function missingOptions(st: ScopeState, path: string, what: string, findings: Sink): void {
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

/**
 * What the option set is at a point: all that a later round's set-aside reads (missingOptions) and all that decides
 * what the option set is after a node (steps, operators and merges never read another port for it).
 */
const optionKey = (s: ScopeState): string => `${s.must.has(OPTION_SET) ? 1 : 0}${s.may.has(OPTION_SET) ? 1 : 0}${s.held ? 1 : 0}${s.aside.get(OPTION_SET) ?? ''}`;
/** All that ST11's relay probe reads: whether the anchor is in scope (whether it is after a node depends on nothing else). */
const anchorKey = (s: ScopeState): string => (s.must.has('anchor') ? '1' : '0');

/**
 * A typing pass.
 * - `first`: the first round, typed once per node: every finding, the typing other rules read, and from each loop or
 *   relay its later rounds and its link check.
 * - `again`: a later round of a loop body or relay link, from the state its back-edge brings; it reports only
 *   set-asides, and types its own inner loops' later rounds.
 * - `probe`: ST11's relay link typed without its anchor, for the anchor it hands on; it reports nothing.
 */
type Pass = 'first' | 'again' | 'probe';

type Memo = Map<Node, Map<string, ScopeState>>;
const remember = (memo: Memo, node: Node, key: string, out: ScopeState) => {
  const byKey = memo.get(node) ?? new Map<string, ScopeState>();
  byKey.set(key, out);
  memo.set(node, byKey);
};

/** Where a probe's findings go: nowhere, since the first round reports every rule on the same link. */
const NOWHERE: Sink = { add: () => undefined };

/**
 * Scope typing of one recipe. A loop body or relay link is typed again from what its back-edge brings, and a relay link
 * once more without its anchor. Both re-typings are memoized by node and by what they read (optionKey, anchorKey), and
 * an answer the first round already gave is not typed again, so nesting does not multiply the work (scope-cost.test.ts).
 */
class ScopeWalk {
  readonly typing: Typing = { stageEntry: new Map(), nodeEntry: new Map() };
  visits = 0;
  /** Outputs by node and option key, of the first round and of later rounds: a later round reached again is known. */
  private readonly rounds: Memo = new Map();
  /** Outputs by node and anchor key, of every pass: the anchor out of a node is known once its anchor in is. */
  private readonly probes: Memo = new Map();
  /** Set-asides found on later rounds, by path, with what the later round was of. */
  readonly later = new Map<string, string>();

  private readonly findings: Findings;

  constructor(findings: Findings) {
    this.findings = findings;
  }

  /** Types `node` from `input`; `label` names the loop or relay a later round belongs to. */
  type(node: Node, input: ScopeState, path: string, pass: Pass, label = ''): ScopeState {
    if (pass !== 'first') {
      const known = pass === 'again' ? this.rounds.get(node)?.get(optionKey(input)) : this.probes.get(node)?.get(anchorKey(input));
      if (known) return known;
    }
    this.visits++;
    const out = this.typeNode(node, input, path, pass, label);
    if (pass !== 'probe') remember(this.rounds, node, optionKey(input), out);
    remember(this.probes, node, anchorKey(input), out);
    return out;
  }

  private sink(pass: Pass, label: string): Sink {
    if (pass === 'first') return this.findings;
    if (pass === 'probe') return NOWHERE;
    return {
      add: (ruleId, path, message, clause) => {
        if (ruleId === 'ST5' && clause === 'set-aside' && !this.later.has(path)) this.later.set(path, `${message} (on a later round of ${label})`);
      },
    };
  }

  private typeNode(node: Node, input: ScopeState, path: string, pass: Pass, label: string): ScopeState {
    if (pass === 'first') this.typing.nodeEntry.set(node, clone(input));
    const findings = this.sink(pass, label);
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
          s = this.type(child, s, `${path}.steps[${i}]`, pass, label);
        });
        return s;
      }
      case 'replicate': {
        const out = this.type(node.body, st, `${path}.body`, pass, label);
        if (!out.must.has('artifact')) findings.add('ST5', path, `replicate "${node.id}" body produces no artifact`);
        st.must.set(OPTION_SET, [{ kind: 'operator', op: 'replicate' }]);
        st.may.add(OPTION_SET);
        st.aside.delete(OPTION_SET);
        return st;
      }
      case 'each': {
        if (!st.must.has(OPTION_SET)) missingOptions(st, path, `each "${node.id}" needs`, findings);
        // Each candidate runs on its own option: the runner hands it the option as the work, and no option list.
        const inner = clone(st);
        inner.must.set('artifact', [{ kind: 'operator', op: 'each' }]);
        inner.may.add('artifact');
        inner.must.delete(OPTION_SET);
        inner.may.delete(OPTION_SET);
        inner.aside.delete(OPTION_SET);
        inner.held = false;
        this.type(node.body, inner, `${path}.body`, pass, label);
        return st;
      }
      case 'pick': {
        if (!st.must.has(OPTION_SET)) missingOptions(st, path, `pick "${node.id}" needs`, findings);
        if (node.judge) {
          // The harness renders every option for the selector.
          const judgeScope = clone(st);
          judgeScope.must.set('view', [{ kind: 'step', role: 'render', actor: 'tool' }]);
          judgeScope.may.add('view');
          this.type(node.judge, judgeScope, `${path}.judge`, pass, label);
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
        const out = this.type(node.body, st, `${path}.body`, pass, label);
        if (pass !== 'probe') this.laterRounds(node.body, st, out, `${path}.body`, `loop "${node.id}"`);
        return out;
      }
      case 'optional': {
        const ran = this.type(node.body, st, `${path}.body`, pass, label);
        return mergeAlternatives([st, ran]);
      }
      case 'route':
        return mergeAlternatives(node.branches.map((b, i) => this.type(b.body, st, `${path}.branches[${i}].body`, pass, label)));
      case 'audit':
        return this.typeAudit(node, st, path, pass, label);
      case 'gate': {
        // The runner keeps only the body's critique: after the gate, the ports before it and that critique (its view
        // and score stay inside).
        const out = this.type(node.body, st, `${path}.body`, pass, label);
        const critique = out.must.get('critique');
        if (critique) st.must.set('critique', [...critique]);
        if (out.may.has('critique')) st.may.add('critique');
        return st;
      }
      case 'relay': {
        // Typed once, like a loop body: the first link starts from the anchor in scope before the chain.
        const out = this.type(node.body, st, `${path}.body`, pass, label);
        if (pass === 'first') this.checkRelayLink(node, st, path);
        if (pass !== 'probe') this.laterRounds(node.body, st, out, `${path}.body`, `relay "${node.id}"`);
        return out;
      }
    }
  }

  /**
   * The second round of a loop body (or the next relay link) starts from what the round before left: an option consumer
   * there may read options a person's write later in the body set aside. Rounds are typed until what they read
   * repeats; only their set-asides are kept (ST12 'set-aside'), and every other port rule is checked on the first round.
   */
  private laterRounds(body: Node, entry: ScopeState, out: ScopeState, path: string, label: string): void {
    const seen = new Set<string>([optionKey(entry)]);
    let next = mergeAlternatives([entry, out]);
    while (!seen.has(optionKey(next))) {
      seen.add(optionKey(next));
      next = mergeAlternatives([entry, this.type(body, next, path, 'again', label)]);
    }
  }

  /**
   * Every lens starts from the same input. After the audit only the lenses' critiques come out, joined under their names
   * (the runner keeps no lens's score: several lenses cannot make one score): `critique` is in scope when a lens makes
   * it on every one of its paths, with every lens that made it as a producer. Anything else a lens makes (a score, its
   * own renders, a vanilla control set) stays inside it.
   */
  private typeAudit(node: Audit, st: MutableState, path: string, pass: Pass, label: string): ScopeState {
    const entry = clone(st);
    const fromLenses = new Map<PortType, Producer[]>();
    node.lenses.forEach((lens, i) => {
      const out = this.type(lens.body, entry, `${path}.lenses[${i}].body`, pass, label);
      const made = producedWithin(lens.body);
      for (const port of AUDIT_OUT) {
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
  private checkRelayLink(node: RelayChain, st: MutableState, path: string): void {
    let reads = false;
    walkNode(node.body, '', 'D1', (n) => {
      if (n.op === 'step' && n.consumes.includes('anchor')) reads = true;
    });
    if (!reads) this.findings.add('ST11', path, `relay "${node.id}" link does not start from the previous link's anchor`, 'no-anchor-in');
    const withoutAnchor = clone(st);
    withoutAnchor.must.delete('anchor');
    const probe = this.type(node.body, withoutAnchor, `${path}.body`, 'probe');
    if (!probe.must.has('anchor')) this.findings.add('ST11', path, `relay "${node.id}" link does not hand on an anchor on every path`, 'no-anchor-out');
  }
}

/**
 * Type the recipe's port flow (spec: "Scope typing"). Emits ST5 for consumed ports that are not guaranteed in scope,
 * ST12 'set-aside' for an option set a later round of a loop or relay reaches set aside, and ST11 for a relay link.
 * `stats`, when given, gains the walk's node visits.
 */
export function typeRecipe(recipe: Recipe, findings: Findings, stats?: TypingStats): Typing {
  const walk = new ScopeWalk(findings);
  let state: ScopeState = {
    must: new Map(recipe.inputs.map((p) => [p, [{ kind: 'input' } as Producer]])),
    may: new Set(recipe.inputs),
    aside: new Map(),
    held: false,
  };
  recipe.stages.forEach((s, i) => {
    walk.typing.stageEntry.set(s.stage, clone(state));
    state = walk.type(s.body, state, `stages[${i}].body`, 'first');
  });
  // A set-aside a later round reaches where the first round already found one is that one.
  const first = new Set(findings.list.filter((f) => f.clause === 'set-aside').map((f) => f.path));
  for (const [path, message] of walk.later) if (!first.has(path)) findings.add('ST12', path, message, 'set-aside');
  if (stats) stats.visits += walk.visits;
  return walk.typing;
}

/** A finished person's write sets the option set aside (it stays in `may`: the runner still holds it). */
function setAside(step: Step, st: MutableState): void {
  if (!personWrite(step) || !(st.may.has(OPTION_SET) || st.held)) return;
  st.must.delete(OPTION_SET);
  st.aside.set(OPTION_SET, step.id);
}

/** Ports any step inside a node produces. */
function producedWithin(node: Node): Set<PortType> {
  const made = new Set<PortType>();
  walkNode(node, '', 'D1', (n) => {
    if (n.op === 'step') for (const p of n.produces) made.add(p);
  });
  return made;
}
