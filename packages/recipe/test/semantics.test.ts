/**
 * The executed semantics (ADR-0092) on small shapes: the effects table, whose words a step writes, VOICE scope and
 * its coverage order, the block of each role, loop exit points and "runs every time", and the field roles. The
 * catalog agreement lives in @byway/catalog's tests and the agreement with the runner in @byway/runner's.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTORS,
  asksSwaps,
  audioAsset,
  audit,
  BLOCK_OF_ROLE,
  blockAgrees,
  changesWork,
  checkpoints,
  covers,
  directionsReactedTo,
  declaresVoice,
  each,
  exitPoints,
  FIELD_ROLES,
  flowRecipe,
  hasNoExecutor,
  leavesNote,
  lockedScripts,
  loop,
  matchCheckpoints,
  oneShotGate,
  optional,
  personWrite,
  pick,
  placements,
  relay,
  replacesCritique,
  replicate,
  ROLES,
  route,
  runOrder,
  runsEveryTime,
  seq,
  step,
  stepEffect,
  voiceScope,
  voiceWrite,
  authorWrite,
  type Gate,
  type Loop,
  type Node,
  type Recipe,
  type Step,
} from '../src/index.ts';
import { minimalRecipe } from './fixtures.ts';

const gate = (metric: string, extra: Partial<Gate> = {}): Gate => ({
  metric,
  ...(metric === 'critic-score' || metric === 'critic-rank' ? { threshold: 3 } : {}),
  hidden: metric !== 'human',
  holder: metric === 'human' ? 'human' : 'harness',
  probe: 1,
  max: 3,
  onCap: 'human',
  onNoConverge: 'recalibrate-human',
  ...extra,
});
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step =>
  step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique', 'score'] });
const check = (id: string): Step => step({ id, role: 'check', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, consumes: ['view'], produces: ['critique'] });
const fix = (id: string): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });
const voice = (id: string, extra: Partial<Step> = {}): Step =>
  step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...extra });
const authorDraft = (id: string, role: 'build' | 'fix' = 'build'): Step => step({ id, role, actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true });

function recipeOf(body: Node, medium: Recipe['medium'] = 'prose'): Recipe {
  const r = minimalRecipe();
  r.medium = medium;
  r.stages = [{ stage: 'D2', body }];
  return r;
}
const ids = (xs: { step: Step }[]) => xs.map((x) => x.step.id);

describe('the effects table', () => {
  it('a model step writes by its role, whatever it declares', () => {
    for (const role of ['build', 'seed', 'fix', 'voice', 'relay', 'render'] as const) {
      expect(stepEffect({ actor: 'model', role, produces: [] }), role).toBe('writes');
    }
    // The flag the review spoofed: a model fix that says it does not write still writes when it runs.
    const spoof = step({ id: 'polish', role: 'fix', actor: 'model', consumes: ['artifact'], produces: [], writes: false });
    expect(stepEffect(spoof)).toBe('writes');
    expect(changesWork(spoof, false)).toBe(true);
  });

  it('a model ASSET writes only when it produces the artifact', () => {
    expect(stepEffect({ actor: 'model', role: 'asset', produces: ['artifact'] })).toBe('writes');
    expect(stepEffect({ actor: 'model', role: 'asset', produces: ['asset'] })).toBe('annotates');
  });

  it('judging and noting model roles annotate, a keep-or-revert restores', () => {
    for (const role of ['critic', 'check', 'cut', 'tells-sweep', 'vision', 'judge', 'select', 'dedupe', 'overlap'] as const) {
      expect(stepEffect({ actor: 'model', role, produces: ['critique', 'artifact'] }), role).toBe('annotates');
    }
    expect(stepEffect({ actor: 'model', role: 'tells-compare', produces: ['taste'] })).toBe('restores');
    expect(stepEffect({ actor: 'human', role: 'tells-compare', produces: ['taste'] })).toBe('restores');
  });

  it('tools render or pass, policies pass', () => {
    expect(stepEffect({ actor: 'tool', role: 'render', produces: ['view'] })).toBe('renders');
    expect(stepEffect({ actor: 'tool', role: 'relay', produces: ['artifact'] })).toBe('passes');
    expect(stepEffect({ actor: 'policy', role: 'build', produces: ['artifact'] })).toBe('passes');
  });

  it('covers every role and actor', () => {
    for (const actor of ACTORS) for (const role of ROLES) expect(['writes', 'restores', 'annotates', 'renders', 'passes']).toContain(stepEffect({ actor, role, produces: ['artifact'] }));
  });

  it('a contained writer changes nothing unless it declares it does (declarations only add)', () => {
    const vanilla = step({ id: 'vanilla', role: 'build', actor: 'model', consumes: ['intent'], produces: ['artifact'] });
    expect(changesWork(vanilla, true)).toBe(false);
    expect(changesWork({ ...vanilla, writes: true }, true)).toBe(true);
    // C5's matte: a tool relay that runs as a skip, declared a writer.
    const matte = step({ id: 'matte', role: 'relay', block: 'RELAY', actor: 'tool', consumes: ['artifact'], produces: ['artifact'], writes: true, keepsVoice: true });
    expect(stepEffect(matte)).toBe('passes');
    expect(changesWork(matte, false)).toBe(true);
  });
});

describe("whose words: the person's writes", () => {
  it('a human VOICE, build or fix that produces the artifact is a person write', () => {
    expect(personWrite(voice('v'))).toBe(true);
    expect(voiceWrite(voice('v'))).toBe(true);
    expect(personWrite(authorDraft('a'))).toBe(true);
    expect(authorWrite(authorDraft('a'))).toBe(true);
    // A human fix runs exactly like a human build: the author's own draft.
    expect(authorWrite(authorDraft('a', 'fix'))).toBe(true);
    expect(voiceWrite(authorDraft('a'))).toBe(false);
  });

  it('the voice source is execution, not the port: a VOICE without the voice port still writes your words', () => {
    expect(voiceWrite(voice('v', { produces: ['artifact'] }))).toBe(true);
    // A VOICE that only produces the port writes nothing into the work.
    const portOnly = voice('v', { produces: ['voice'] });
    expect(voiceWrite(portOnly)).toBe(false);
    expect(declaresVoice(portOnly)).toBe(true);
  });

  it('a model step declaring VOICE, or a human vision labelled VOICE, is not a VOICE write', () => {
    expect(voiceWrite({ actor: 'model', role: 'fix', produces: ['voice', 'artifact'] })).toBe(false);
    expect(voiceWrite({ actor: 'human', role: 'vision', produces: ['voice', 'artifact'] })).toBe(false);
  });
});

describe('VOICE scope and its coverage order', () => {
  it('reads variant, knobs and medium as the runner does', () => {
    expect(voiceScope({ variant: 'claim-log' }, 'prose')).toEqual({ base: 'claims', keyLines: false });
    expect(voiceScope({ variant: 'VOICE-early' }, 'media')).toEqual({ base: 'script', keyLines: false });
    expect(voiceScope({}, 'media')).toEqual({ base: 'on-screen', keyLines: false });
    expect(voiceScope({ knobs: { scope: 'key-lines' } }, 'prose')).toEqual({ base: 'all', keyLines: true });
    expect(voiceScope({ knobs: { scope: 'every-line' } }, 'web-page')).toEqual({ base: 'all', keyLines: false });
  });

  it('every line covers key lines, never the reverse, and only of the same copy', () => {
    const every = { base: 'all' as const, keyLines: false };
    const key = { base: 'all' as const, keyLines: true };
    expect(covers(every, key)).toBe(true);
    expect(covers(key, every)).toBe(false);
    expect(covers({ base: 'claims', keyLines: false }, every)).toBe(false);
    expect(covers({ base: 'script', keyLines: false }, { base: 'on-screen', keyLines: false })).toBe(false);
  });

  it('matches checkpoints one to one: two VOICE steps of the nearest need two', () => {
    const near = checkpoints(recipeOf(seq(voice('a'), voice('b'))));
    expect(near).toHaveLength(2);
    const one = checkpoints(recipeOf(voice('only')));
    expect([...matchCheckpoints(near, one).values()].filter((x) => x === undefined)).toHaveLength(1);
    // A wider VOICE stands for a key-lines one.
    const keyLines = checkpoints(recipeOf(voice('k', { knobs: { scope: 'key-lines' } })));
    expect([...matchCheckpoints(keyLines, one).values()].every(Boolean)).toBe(true);
    expect([...matchCheckpoints(one, keyLines).values()].every(Boolean)).toBe(false);
  });
});

describe('the block of each role', () => {
  it('a block label must be its role’s block; a check may carry CRITIC or nothing', () => {
    expect(BLOCK_OF_ROLE.voice).toBe('VOICE');
    expect(blockAgrees(voice('v'))).toBe(true);
    expect(blockAgrees({ role: 'voice' })).toBe(false);
    expect(blockAgrees({ role: 'vision', block: 'VOICE' })).toBe(false);
    expect(blockAgrees({ role: 'fix', block: 'CUT' })).toBe(false);
    expect(blockAgrees({ role: 'fix' })).toBe(true);
    expect(blockAgrees({ role: 'check' })).toBe(true);
    expect(blockAgrees({ role: 'check', block: 'CRITIC' })).toBe(true);
    expect(blockAgrees({ role: 'check', block: 'TELLS' })).toBe(false);
  });
});

describe('loop exit points', () => {
  const body = (...steps: Node[]) => seq(render('r'), ...steps);
  const exits = (l: Loop) => exitPoints(l).map((s) => s.id);

  it('a model critic under a critic gate, or a model check under a check-clean gate', () => {
    expect(exits(loop('l', body(critic('c'), fix('f')), gate('critic-score')))).toEqual(['c']);
    expect(exits(loop('l', body(critic('c'), fix('f')), gate('critic-rank')))).toEqual(['c']);
    expect(exits(loop('l', body(check('k'), fix('f')), gate('check-clean')))).toEqual(['k']);
    // A check does not report to a critic gate, nor a critic to a check gate, and a person's loop has none.
    expect(exits(loop('l', body(check('k'), fix('f')), gate('critic-score')))).toEqual([]);
    expect(exits(loop('l', body(critic('c'), fix('f')), gate('check-clean')))).toEqual([]);
    expect(exits(loop('l', body(critic('c'), fix('f')), gate('human')))).toEqual([]);
  });

  it('through seq, relay, route and optional; not through replicate, each, audit, a gate or an inner loop', () => {
    expect(exits(loop('l', relay('links', 2, seq(render('r'), critic('c'))), gate('critic-score')))).toEqual(['c']);
    expect(exits(loop('l', route('which', 'mode', [{ name: 'a', body: critic('c') }, { name: 'b', body: render('r') }]), gate('critic-score')))).toEqual(['c']);
    expect(exits(loop('l', optional('maybe', 'needed', critic('c')), gate('critic-score')))).toEqual(['c']);
    expect(exits(loop('l', replicate('x', 2, critic('c')), gate('critic-score')))).toEqual([]);
    expect(exits(loop('l', each('e', critic('c')), gate('critic-score')))).toEqual([]);
    expect(exits(loop('l', audit('a', [{ name: 'c', body: critic('c') }]), gate('critic-score')))).toEqual([]);
    expect(exits(loop('l', oneShotGate('g', critic('c'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }), gate('critic-score')))).toEqual([]);
    expect(exits(loop('l', loop('inner', seq(critic('c'), fix('f')), gate('critic-score')), gate('critic-score')))).toEqual([]);
  });
});

describe('runs every time', () => {
  it('a step after an exit point may never run; one before it always does (K1)', () => {
    const r = recipeOf(seq(loop('final-pass', seq(render('r'), check('defects'), voice('voice')), gate('check-clean', { max: 1 }))));
    const every = ids(runsEveryTime(r));
    expect(every).toEqual(['r', 'defects']);
    expect(checkpoints(r)).toEqual([]);
    const before = recipeOf(seq(loop('final-pass', seq(voice('voice'), render('r'), check('defects')), gate('check-clean'))));
    expect(checkpoints(before).map((c) => c.kind)).toEqual(['voice']);
  });

  it('a later relay link after a check in an earlier one may not run, nor anything after the relay in that loop', () => {
    const r = recipeOf(loop('pass', seq(relay('links', 2, seq(render('r'), check('k'))), voice('voice')), gate('check-clean')));
    expect(ids(runsEveryTime(r))).toEqual(['r', 'k']);
  });

  it('optionals, routes, lenses, gate bodies and pick judges are not every time; candidates and inner loops are', () => {
    const judge = step({ id: 'judge', role: 'judge', actor: 'model', consumes: ['view'], produces: [] });
    const r = recipeOf(
      seq(
        replicate('x', 2, step({ id: 'seed', role: 'seed', block: 'SEED', actor: 'model', consumes: ['intent'], produces: ['artifact'], writes: true })),
        pick('p', 'C', 1, 'model', judge),
        optional('o', 'needed', fix('opt-fix')),
        route('rt', 'mode', [{ name: 'a', body: fix('route-fix') }]),
        audit('au', [{ name: 'c', body: critic('lens-critic') }]),
        oneShotGate('g', critic('gate-critic'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }),
        loop('inner', seq(render('r'), critic('c'), fix('after')), gate('critic-score')),
      ),
    );
    expect(ids(runsEveryTime(r))).toEqual(['seed', 'r', 'c']);
    const where = Object.fromEntries(placements(r).map((p) => [p.step.id, p]));
    expect(where.seed).toMatchObject({ perCandidate: true, contained: false, conditional: false });
    expect(where.judge).toMatchObject({ contained: true, path: 'stages[0].body.steps[1].judge' });
    expect(where['lens-critic']).toMatchObject({ contained: true });
    expect(where['gate-critic']).toMatchObject({ contained: true });
    expect(where['opt-fix']).toMatchObject({ contained: false, conditional: true });
    expect(where.after).toMatchObject({ conditional: true });
  });

  it('a person write inside a candidate is not a checkpoint', () => {
    expect(checkpoints(recipeOf(replicate('x', 2, voice('v'))))).toEqual([]);
  });
});

describe('field roles', () => {
  it('classify every field of every schema object as a name, a child, a semantic value or a semantic set', () => {
    for (const [obj, roles] of Object.entries(FIELD_ROLES)) {
      for (const [field, role] of Object.entries(roles)) expect(['name', 'child', 'semantic', 'semantic-set'], `${obj}.${field}`).toContain(role);
    }
    // Every key of a full step and a full recipe is classified (the mapped type makes a missing one a type error).
    const full = step({ id: 'x', role: 'fix', block: 'CUT', glue: 'RENDER', actor: 'model', tier: 'mid', isolated: true, frozenPrompt: true, prompt: 'p', consumes: [], reads: [], produces: [], writes: true, keepsVoice: true, proxyFor: 'human', knobs: {}, variant: 'v' });
    expect(Object.keys(full).filter((k) => !(k in FIELD_ROLES.step))).toEqual([]);
    expect(Object.keys(minimalRecipe()).filter((k) => !(k in FIELD_ROLES.recipe))).toEqual([]);
    expect(FIELD_ROLES.step.id).toBe('name');
    // The runner reads a step's consumed ports in order (buildPrompt lays out their images in that order).
    expect(FIELD_ROLES.step.consumes).toBe('semantic');
    // What a step reads when it is there fills its prompt the same way, after the consumed ports (ADR-0089).
    expect(FIELD_ROLES.step.reads).toBe('semantic');
    expect(FIELD_ROLES.step.produces).toBe('semantic-set');
    expect(FIELD_ROLES.step.variant).toBe('semantic');
    expect(FIELD_ROLES.route.id).toBe('semantic');
    // A route's question is what a person is asked to choose on at run time (routePrompt), as an optional's trigger is.
    expect(FIELD_ROLES.route.on).toBe('semantic');
    expect(FIELD_ROLES.optional.trigger).toBe('semantic');
  });
});

describe("a TELLS sweep's swap choice (asksSwaps, the interpreter's seq)", () => {
  const sweep = step({ id: 'sweep', role: 'tells-sweep', block: 'TELLS', actor: 'model', tier: 'mid', prompt: 'p.s', consumes: ['artifact', 'tells'], produces: ['critique'] });
  const swaps = step({ id: 'swaps', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.f', consumes: ['artifact', 'critique'], produces: ['artifact'], writes: true });
  const compare = (actor: 'human' | 'model') => step({ id: 'compare', role: 'tells-compare', block: 'TELLS', actor, ...(actor === 'model' ? { tier: 'mid' as const, prompt: 'p.c' } : {}), consumes: ['artifact'], produces: ['taste'] });

  it('asks when the next step in its own seq that reads a critique is a model fix, and no machine keeps or reverts', () => {
    expect(asksSwaps(sweep, [swaps, compare('human')])).toBe(true);
    expect(asksSwaps(sweep, [swaps, compare('model')])).toBe(false);
    expect(asksSwaps(sweep, [compare('human')])).toBe(false);
    expect(asksSwaps({ ...sweep, actor: 'human' } as Node, [swaps])).toBe(false);
    expect(asksSwaps(swaps, [swaps])).toBe(false);
  });

  it('reads only its own seq: the same steps behind a nested seq never ask', () => {
    expect(asksSwaps(sweep, [seq(swaps, compare('human'))])).toBe(false);
  });

  it('looks for the step that consumes the critique: a fix that only reads it when there is one takes in every find', () => {
    const { consumes: _c, ...rest } = swaps;
    const reading = step({ ...rest, consumes: ['artifact'], reads: ['critique'] });
    expect(asksSwaps(sweep, [reading, compare('human')])).toBe(false);
    expect(asksSwaps(sweep, [reading, swaps, compare('human')])).toBe(true);
  });

  it('never asks when something before the swap step can put another critique in place of the finds: the choice would decide nothing', () => {
    const r = render('r');
    const human = (role: Step['role'], produces: Step['produces']) => step({ id: `h-${role}`, role, actor: 'human', consumes: ['view'], produces });
    for (const between of [
      critic('c'),
      check('k'),
      human('cut', ['critique']),
      human('vision', ['critique']),
      audit('au', [{ name: 'c', body: critic('lens') }]),
      optional('o', 'a person wants a review', critic('oc')),
      oneShotGate('g', critic('gc'), { metric: 'critic-score', threshold: 8, hidden: true, holder: 'harness' }),
      loop('l', seq(r, check('lk')), gate('check-clean')),
    ] as Node[]) {
      expect(replacesCritique(between), JSON.stringify(between).slice(0, 60)).toBe(true);
      expect(asksSwaps(sweep, [between, swaps, compare('human')])).toBe(false);
    }
    // A render, a person's taste, a write, or a critic inside a candidate or a pick's judge leave the finds in place.
    for (const between of [r, human('vision', ['taste']), authorDraft('own'), replicate('x', 2, critic('xc'))] as Node[]) {
      expect(replacesCritique(between)).toBe(false);
      expect(asksSwaps(sweep, [between, swaps, compare('human')])).toBe(true);
    }
    // After the swap step, a critique changes nothing about the choice.
    expect(asksSwaps(sweep, [swaps, critic('after'), compare('human')])).toBe(true);
  });
});

describe('steps with no executor yet (ADR-0069)', () => {
  it('a policy step, a tool other than a render, and a model ASSET that makes voice-over audio finish skipped', () => {
    const facts = (actor: Step['actor'], role: Step['role'], consumes: Step['consumes'] = ['artifact']) => ({ actor, role, consumes, produces: ['artifact'] as Step['produces'] });
    expect(hasNoExecutor(facts('tool', 'relay'))).toBe(true);
    expect(hasNoExecutor(facts('tool', 'cut'))).toBe(true);
    expect(hasNoExecutor(facts('policy', 'build'))).toBe(true);
    expect(hasNoExecutor(facts('model', 'asset', ['voice', 'artifact']))).toBe(true);
    expect(audioAsset({ role: 'asset', consumes: ['voice', 'artifact'] })).toBe(true);
    expect(hasNoExecutor(facts('tool', 'render'))).toBe(false);
    expect(hasNoExecutor(facts('model', 'asset'))).toBe(false);
    expect(hasNoExecutor(facts('model', 'relay', ['anchor', 'artifact']))).toBe(false);
    // A person's step is asked, whatever its role.
    expect(hasNoExecutor(facts('human', 'asset', ['voice', 'artifact']))).toBe(false);
    // The audio ASSET keeps its effect: admission holds it to what it writes once it has an executor.
    expect(stepEffect(facts('model', 'asset', ['voice', 'artifact']))).toBe('writes');
  });
});

describe('run order: what can run after a step', () => {
  const script = (id: string) => voice(id, { variant: 'VOICE-early' });
  const onScreen = (id: string) => voice(id);
  const claims = (id: string) => voice(id, { variant: 'claim-log' });
  const locked = (r: Recipe) => [...lockedScripts(r)].map((s) => s.id);

  it('a script is locked when nothing you write later can reach the voice-over; the on-screen words cannot', () => {
    expect(locked(recipeOf(seq(script('vo'), onScreen('words')), 'media'))).toEqual(['vo']);
    expect(locked(recipeOf(seq(script('vo'), script('again'), onScreen('words')), 'media'))).toEqual(['again']);
    expect(locked(recipeOf(seq(script('vo'), claims('facts')), 'media'))).toEqual([]);
    expect(locked(recipeOf(seq(script('vo'), authorDraft('own', 'fix')), 'media'))).toEqual([]);
  });

  it('nor when it runs again: a loop round, a relay link, a stage a final check re-runs', () => {
    expect(locked(recipeOf(loop('l', seq(script('vo'), onScreen('words')), gate('human')), 'media'))).toEqual([]);
    expect(locked(recipeOf(relay('chain', 2, script('vo')), 'media'))).toEqual([]);
    const staged = (retryStage: 'D1' | 'D2'): Recipe => {
      const r = recipeOf(seq(script('vo')), 'media');
      const check = oneShotGate('final', critic('fc'), { metric: 'critic-rank', threshold: 3, hidden: true, holder: 'harness' }, { stage: retryStage, times: 1 });
      r.stages = [
        { stage: 'D1', body: seq(script('vo')) },
        { stage: 'D2', body: seq(step({ id: 'b', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.b', consumes: ['artifact'], produces: ['artifact'], writes: true, keepsVoice: true })) },
        { stage: 'D3', body: seq(onScreen('words'), render('fr'), check) },
      ];
      return r;
    };
    expect(locked(staged('D2'))).toEqual(['vo']);
    expect(locked(staged('D1'))).toEqual([]);
  });

  it('only a storyboard has a script; a step object used twice is locked only where both places are', () => {
    expect(locked(recipeOf(seq(script('vo'), onScreen('words')), 'prose'))).toEqual([]);
    const vo = script('vo');
    expect(locked(recipeOf(seq(vo, onScreen('words'), vo), 'media'))).toEqual([]);
  });

  it('fans out in separate sessions only inside each or a replicate of more than one, and knows a relay link', () => {
    const order = runOrder(recipeOf(seq(replicate('one', 1, critic('a')), replicate('four', 4, critic('b')), each('e', critic('c')), relay('chain', 2, critic('d')))));
    expect(order.steps.map((o) => [o.step.id, o.fanOut, o.inRelay])).toEqual([
      ['a', false, false],
      ['b', true, false],
      ['c', true, false],
      ['d', false, true],
    ]);
  });
});

describe('the flow walk (flowRecipe)', () => {
  /** The ids of the steps on each path, as sets of sorted strings. */
  const paths = (r: Recipe, after?: (node: Node, entry: string[], inner: string[]) => string[]) =>
    [...flowRecipe<string[]>(r, [''], {
      step: (s, _p, _st, state) => state.map((x) => `${x}${x ? ' ' : ''}${s.id}`),
      join: (states) => [...new Set(states.flat())].sort(),
      ...(after ? { after: (node, entry, inner) => after(node, entry, inner) } : {}),
    })].sort();

  it('forks and joins: a replicate joins its body with the state before it, an audit its lenses, a gate its body', () => {
    expect(paths(recipeOf(seq(critic('a'), replicate('x', 2, critic('b')), critic('c'))))).toEqual(['a b c', 'a c']);
    expect(paths(recipeOf(seq(audit('au', [{ name: 'p', body: critic('p') }, { name: 'q', body: critic('q') }]), critic('c'))))).toEqual(['p c', 'q c']);
    expect(paths(recipeOf(seq(oneShotGate('g', critic('g1'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }), critic('c'))))).toEqual(['g1 c']);
  });

  it('`after` says what an operator that hands on less than what ran inside it hands on: here, its entry state', () => {
    const entry = (_node: Node, before: string[]) => before;
    expect(paths(recipeOf(seq(critic('a'), replicate('x', 2, critic('b')), critic('c'))), entry)).toEqual(['a c']);
    expect(paths(recipeOf(seq(critic('a'), each('e', critic('b')), critic('c'))), entry)).toEqual(['a c']);
    expect(paths(recipeOf(seq(critic('a'), audit('au', [{ name: 'p', body: critic('p') }]), critic('c'))), entry)).toEqual(['a c']);
    // Loops, optionals and routes hand on what ran in them, whatever `after` says.
    expect(paths(recipeOf(seq(critic('a'), optional('o', 'needed', critic('b')), critic('c'))), entry)).toEqual(['a b c', 'a c']);
  });
});

describe('whose directions your next VISION is shown (directionsReactedTo)', () => {
  const ai = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'model', tier: 'mid', prompt: 'p.v', consumes: ['intent'], produces: ['brief'] });
  const yours = (id: string): Step => step({ id, role: 'vision', block: 'VISION', actor: 'human', consumes: ['brief'], produces: ['taste'] });
  const reacted = (r: Recipe) => [...directionsReactedTo(r)].map((s) => s.id).sort();
  const finalCheck = (id: string, retry?: 'D2' | 'D3') => oneShotGate(id, critic(`${id}-critic`), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, retry ? { stage: retry, times: 1 } : undefined);

  it('the AI directions a VISION of yours follows, with nothing that leaves a note of its own between them', () => {
    expect(leavesNote(ai('v'))).toBe(true);
    expect(reacted(recipeOf(seq(ai('v'), yours('p'))))).toEqual(['v']);
    expect(reacted(recipeOf(seq(ai('v'), render('r'), yours('p'))))).toEqual(['v']);
    expect(reacted(recipeOf(seq(ai('v'))))).toEqual([]);
    expect(reacted(recipeOf(seq(yours('p'), ai('v'))))).toEqual([]);
    expect(reacted(recipeOf(seq(ai('v'), critic('c'), yours('p'))))).toEqual([]);
    // On every path: a note that may be left between them is enough to take the claim away.
    expect(reacted(recipeOf(seq(ai('v'), optional('o', 'needed', check('k')), yours('p'))))).toEqual([]);
    // Only the next VISION of yours is about these directions: a later one may be shown other notes.
    expect(reacted(recipeOf(seq(ai('v'), yours('p'), critic('c'), yours('q'))))).toEqual(['v']);
  });

  it('a loop a person holds: the directions are shown at the next round, and the last of two is the one shown (C2)', () => {
    expect(reacted(recipeOf(loop('l', seq(yours('p'), ai('v')), gate('human'))))).toEqual(['v']);
    expect(reacted(recipeOf(loop('l', seq(yours('p'), ai('v'), ai('w')), gate('human'))))).toEqual(['w']);
  });

  it('as the operators hand notes on: a candidate, a pick or a final check hands on the notes it started with; an audit its lenses’', () => {
    expect(reacted(recipeOf(seq(ai('v'), replicate('x', 2, critic('c')), yours('p'))))).toEqual(['v']);
    expect(reacted(recipeOf(seq(ai('v'), finalCheck('g'), yours('p'))))).toEqual(['v']);
    expect(reacted(recipeOf(seq(ai('v'), audit('au', [{ name: 'c', body: critic('c') }]), yours('p'))))).toEqual([]);
    // Directions made inside a candidate stay there.
    expect(reacted(recipeOf(seq(replicate('x', 2, ai('v')), yours('p'))))).toEqual([]);
    expect(reacted(recipeOf(seq(audit('au', [{ name: 'v', body: ai('v') }]), yours('p'))))).toEqual([]);
  });

  it("a final check that re-runs the directions' stage starts it again without them", () => {
    const staged = (retry: 'D2' | 'D3'): Recipe => {
      const r = recipeOf(seq(ai('v')));
      r.stages = [
        { stage: 'D2', body: seq(ai('v'), finalCheck('g', retry)) },
        { stage: 'D3', body: seq(yours('p')) },
      ];
      return r;
    };
    expect(reacted(staged('D2'))).toEqual([]);
    const later = staged('D2');
    later.stages = [
      { stage: 'D2', body: seq(ai('v')) },
      { stage: 'D3', body: seq(finalCheck('g', 'D3'), yours('p')) },
    ];
    expect(reacted(later)).toEqual(['v']);
  });

  it('a step object used twice is reacted to only where both places are', () => {
    const v = ai('v');
    expect(reacted(recipeOf(seq(v, yours('p'), v)))).toEqual([]);
    expect(reacted(recipeOf(seq(v, yours('p'), v, yours('q'))))).toEqual(['v']);
  });
});

describe('the module stays pure (workflow code may import it)', () => {
  it('imports only types and no Node built-ins', () => {
    const src = readFileSync(new URL('../src/semantics.ts', import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*?from\s+'([^']+)'/gm)];
    expect(imports.length).toBeGreaterThan(0);
    for (const m of imports) expect(m[1], m[0]).toBe('type ');
    expect(src).not.toMatch(/from\s+'node:/);
  });
});
