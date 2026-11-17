/**
 * What audit, a one-shot gate and each hand on, as the interpreter runs them, agrees with what the validator's scope
 * typing infers (R-PORTS-TEST in the approved P2 design; the backlog row "Operator output ports are defined twice:
 * audit, a one-shot gate and each"; the review's F01 acceptance, "tiny accepted-graph execution tests with downstream
 * consumers so inferred and actual ports agree"). Small admitted recipes run through the real Interpreter with its
 * activities stubbed. At the entry of every node, the ports the interpreter hands it hold every port the typing says is
 * in scope there on every path, and none it says no path makes; and the consumer after each operator shows what the
 * operator hands on:
 * - an audit: its lenses' critiques, joined under their names, and nothing else they made (a lens's view and score stay
 *   in it); beside the work, its lenses' notes, which are no port;
 * - a one-shot gate: its body's critique, with the view and the score from before it;
 * - each: inside, one option per candidate, as the work, with its own view of a pool render and no option set; after
 *   it, the candidates' work as the options.
 */
import { describe, expect, it, vi } from 'vitest';
import { OPTION_SET, type PortType } from '@byway/protocol';
import { audit, each, oneShotGate, optional, pick, replicate, seq, step, type Node, type Recipe, type Step } from '@byway/recipe';
import { scopeTyping, validate } from '@byway/validator';
import type { Ports, RunInput } from '../src/types.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const state = vi.hoisted(() => ({ n: 0 }));

/** Every value a stub makes names the step that made it, so the ports a step is handed say where each came from. */
vi.mock('../src/workflow/acts.ts', () => {
  type Input = { call?: { stepId: string }; step?: { role: string }; artifactIds?: string[]; pool?: boolean };
  const respond = (name: string, input: Input): unknown => {
    const id = input.call?.stepId ?? '';
    const n = ++state.n;
    switch (name) {
      case 'modelStep':
        switch (input.step?.role) {
          case 'critic':
            return { costUsd: 0, text: `critique of ${id}`, score: { kind: 'score', value: n }, noteArtifactId: `note:${id}` };
          case 'check':
            return { costUsd: 0, text: `critique of ${id}`, noteArtifactId: `note:${id}` };
          default:
            return { costUsd: 0, artifactId: `work:${id}#${n}` };
        }
      case 'renderView':
        return { costUsd: 0, view: { pool: input.pool === true, items: (input.artifactIds ?? []).map((a) => ({ imageArtifactIds: [`view:${id}:${a}`] })) } };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const draft = (id: string): Step => step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const renderPool = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: [OPTION_SET], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
const check = (id: string): Step => step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, prompt: 'p.check', consumes: ['view'], produces: ['critique'] });
const fix = (id: string, consumes: Step['consumes'] = ['artifact', 'critique']): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes, produces: ['artifact'], writes: true });
const pass = { metric: 'critic-score', threshold: 1, hidden: true, holder: 'harness' } as const;

/** The ports the interpreter holds, by the port type each one carries (run inputs such as the intent are not ports). */
const FIELDS: readonly [PortType, keyof Ports][] = [
  ['artifact', 'artifact'],
  [OPTION_SET, 'options'],
  ['view', 'view'],
  ['score', 'score'],
  ['critique', 'critique'],
  ['brief', 'brief'],
  ['taste', 'taste'],
  ['voice', 'voice'],
  ['anchor', 'anchor'],
  ['asset', 'asset'],
];
const held = (p: Ports): Set<PortType> => new Set(FIELDS.filter(([, f]) => p[f] !== undefined).map(([t]) => t));

const recipeOf = (body: Node): Recipe => ({ schema: 'byway.recipe/1', id: 'operator-ports', title: 'Operator ports', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D2', body }], sitsOut: [], exceptions: [], bank: false });

/** A run of `recipe`: every node's entry with the ports the interpreter handed it, in order; each step's by its id, and what it handed on. */
interface Run {
  entries: { node: Node; ports: Ports }[];
  at(id: string): Ports[];
  after(id: string): Ports[];
}

/** Run `recipe` through the real Interpreter; a person picks the first draft, and a confirm is yes. */
async function run(recipe: Recipe): Promise<Run> {
  const input: RunInput = { runId: 'run-ports', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  const entries: Run['entries'] = [];
  const exits: Run['entries'] = [];
  const node = engine.node.bind(engine);
  Object.assign(engine, {
    ask: async (_call: unknown, cp: { kind: string }) => (cp.kind === 'pick' ? { checkpointId: 'cp', choice: ['A'] } : { checkpointId: 'cp', approved: true }),
    // The interpreter walks the recipe through node(), so every node's entry is seen here.
    node: async (n: Node, ports: Ports, ctx: never) => {
      entries.push({ node: n, ports });
      const out = await node(n, ports, ctx);
      exits.push({ node: n, ports: out });
      return out;
    },
  });
  await engine.runStages();
  const of = (list: Run['entries'], id: string) => list.filter((e) => 'id' in e.node && e.node.id === id).map((e) => e.ports);
  return { entries, at: (id) => of(entries, id), after: (id) => of(exits, id) };
}

/**
 * Where the run and the typing disagree: a node handed less than the typing says is in scope there on every path
 * (`must`), or a port it says no path makes before it (`may`; a pick of one leaves its choice as the option list, which
 * the typing calls `held`).
 */
function disagreements(recipe: Recipe, r: Run): string[] {
  const typing = scopeTyping(recipe);
  const out = new Set<string>();
  for (const { node, ports } of r.entries) {
    const name = `${node.op} ${'id' in node ? node.id : ''}`;
    const st = typing.nodeEntry.get(node);
    if (!st) {
      out.add(`${name}: not typed`);
      continue;
    }
    const have = held(ports);
    for (const [port] of FIELDS) {
      if (st.must.has(port) && !have.has(port)) out.add(`${name}: ${port} is in scope on every path, but not handed in`);
      if (have.has(port) && !st.may.has(port) && !(port === OPTION_SET && st.held)) out.add(`${name}: ${port} is handed in, but no path makes it`);
    }
  }
  return [...out];
}

describe('an audit, then a consumer', () => {
  const apply_ = fix('apply');
  const recipe = recipeOf(
    seq(
      draft('draft'),
      render('look'),
      check('first-read'),
      audit('reads', [
        { name: 'clarity', body: seq(render('lens-look'), critic('clarity')) },
        { name: 'tone', body: critic('tone') },
      ]),
      apply_,
      critic('after'),
    ),
  );

  it('is admitted, and every node is handed what the typing says is in scope there', async () => {
    expect(validate(recipe).violations).toEqual([]);
    expect(disagreements(recipe, await run(recipe))).toEqual([]);
  });

  it('hands on its lenses’ critiques, joined, in place of the one before it, and nothing else they made', async () => {
    const r = await run(recipe);
    const [apply] = r.at('apply');
    expect(apply!.critique).toBe('## clarity\ncritique of clarity\n\n## tone\ncritique of tone');
    // The view is the one from before the audit, not the lens's own render; no lens's score comes out.
    expect(apply!.view?.items[0]?.imageArtifactIds[0]).toMatch(/^view:look:/);
    expect(apply!.score).toBeUndefined();
    expect(r.at('after')[0]!.view?.items[0]?.imageArtifactIds[0]).toMatch(/^view:look:/);
    // Beside the work: the lenses' notes in place of the check's. A note is no port, so the typing says nothing of it.
    expect(apply!.notes).toEqual(['note:clarity', 'note:tone']);
    // The typing says the same: the critique after the audit is its lenses' critics', not the check's from before it.
    expect(scopeTyping(recipe).nodeEntry.get(apply_)!.must.get('critique')).toEqual([{ kind: 'step', role: 'critic', actor: 'model' }]);
  });
});

describe('a one-shot gate, then view and score consumers', () => {
  const polish = fix('polish', ['artifact', 'critique', 'view', 'score']);
  // Before the gate: a critic's score, then a check's critique in place of the critic's.
  const recipe = recipeOf(seq(draft('draft'), render('look'), critic('first-read'), check('first-check'), oneShotGate('final', seq(render('gate-look'), critic('gate-critic')), pass), polish));

  it('is admitted, and every node is handed what the typing says is in scope there', async () => {
    expect(validate(recipe).violations).toEqual([]);
    expect(disagreements(recipe, await run(recipe))).toEqual([]);
  });

  it('hands on its body’s critique, with the view and the score from before it', async () => {
    const r = await run(recipe);
    const [p] = r.at('polish');
    expect(p!.critique).toBe('critique of gate-critic');
    expect(p!.view?.items[0]?.imageArtifactIds[0]).toMatch(/^view:look:/);
    expect(p!.score).toEqual(r.after('first-read')[0]!.score);
    expect(p!.score).not.toEqual(r.after('gate-critic')[0]!.score);
    // The typing says the same: the critique after the gate is its body's critic's, not the check's from before it.
    expect(scopeTyping(recipe).nodeEntry.get(polish)!.must.get('critique')).toEqual([{ kind: 'step', role: 'critic', actor: 'model' }]);
  });

  it('where only its body rendered, the typing refuses a view consumer after it (ST5), and the run hands that consumer none', async () => {
    const blind = recipeOf(seq(draft('draft'), oneShotGate('final', seq(render('gate-look'), critic('gate-critic')), pass), fix('polish', ['artifact', 'view'])));
    expect(validate(blind).violations.map((v) => `${v.ruleId} ${v.message}`)).toEqual(['ST5 step "polish" consumes view, which is not in scope on every path']);
    const r = await run(blind);
    expect(disagreements(blind, r)).toEqual([]);
    const [p] = r.at('polish');
    expect(p!.view).toBeUndefined();
    expect(p!.score).toBeUndefined();
    expect(p!.critique).toBe('critique of gate-critic');
  });
});

describe('each, over a pool render, then a pick', () => {
  const recipe = recipeOf(
    seq(replicate('drafts', 3, draft('draft')), renderPool('pool'), each('per-draft', seq(critic('per-draft-critic'), fix('per-draft-fix'))), pick('choose', 'H', 1, 'human'), critic('after')),
  );

  it('is admitted, and every node is handed what the typing says is in scope there', async () => {
    expect(validate(recipe).violations).toEqual([]);
    expect(disagreements(recipe, await run(recipe))).toEqual([]);
  });

  it('hands each candidate its own option as the work, with its own view of the pool and no option set; then the candidates’ work as the options', async () => {
    const r = await run(recipe);
    const options = r.at('pool')[0]!.options!;
    expect(options).toHaveLength(3);
    const inside = r.at('per-draft-critic');
    expect(inside.map((p) => p.artifact)).toEqual(options);
    expect(inside.map((p) => p.view)).toEqual(options.map((o) => ({ pool: false, items: [{ imageArtifactIds: [`view:pool:${o}`] }] })));
    expect(inside.map((p) => p.options)).toEqual([undefined, undefined, undefined]);
    // After it, the options are the candidates' work, in order, and the pick chooses among them.
    const [choose] = r.at('choose');
    expect(choose!.options).toEqual(r.after('per-draft-fix').map((p) => p.artifact));
    expect(choose!.options!.every((o) => o.startsWith('work:per-draft-fix#'))).toBe(true);
  });
});

describe('each, over options made after a render of the work (B-063)', () => {
  // The render is of the draft before the options; the options are new drafts no one rendered, so no view is theirs.
  const recipe = recipeOf(
    seq(draft('first'), render('look'), replicate('drafts', 2, draft('draft')), each('per-draft', seq(critic('per-draft-critic'), fix('per-draft-fix'))), pick('choose', 'H', 1, 'human')),
  );

  it('is refused: a critic inside it would judge every candidate by the earlier render, not its own (ST5)', () => {
    expect(validate(recipe).violations.map((v) => `${v.ruleId} ${v.message}`)).toEqual(['ST5 step "per-draft-critic" consumes view, which is not in scope on every path']);
  });

  it('hands no candidate the earlier render as its view, inside it or at the pick', async () => {
    const r = await run(recipe);
    expect(r.at('per-draft').map((p) => p.optionViews)).toEqual([[undefined, undefined]]);
    expect(r.at('per-draft-critic').map((p) => p.view)).toEqual([undefined, undefined]);
  });
});

describe('each, over options whose drafts each rendered (B-064 (c))', () => {
  const recipe = recipeOf(seq(replicate('drafts', 2, seq(draft('draft'), render('shot'))), each('per-draft', seq(critic('per-draft-critic'), fix('per-draft-fix'))), pick('choose', 'H', 1, 'human')));

  it('is admitted, and every node is handed what the typing says is in scope there', async () => {
    expect(validate(recipe).violations).toEqual([]);
    expect(disagreements(recipe, await run(recipe))).toEqual([]);
  });

  it('hands each candidate its own render', async () => {
    const r = await run(recipe);
    const options = r.at('per-draft')[0]!.options!;
    expect(r.at('per-draft-critic').map((p) => p.view)).toEqual(options.map((o) => ({ pool: false, items: [{ imageArtifactIds: [`view:shot:${o}`] }] })));
  });
});

describe('each, over options some of whose drafts may render', () => {
  const recipe = recipeOf(
    seq(draft('first'), render('look'), replicate('drafts', 2, seq(draft('draft'), optional('maybe', 'if wanted', render('shot')))), each('per-draft', fix('per-draft-fix', ['artifact', 'view']))),
  );

  it('is refused where a candidate may have no view of its own (ST5)', () => {
    expect(validate(recipe).violations.map((v) => `${v.ruleId} ${v.message}`)).toEqual(['ST5 step "per-draft-fix" consumes view, which is not in scope on every path']);
  });
});
