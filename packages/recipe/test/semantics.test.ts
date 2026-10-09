/**
 * The executed semantics (ADR-0092) on small shapes: the effects table, whose words a step writes, VOICE scope and
 * its coverage order, the block of each role, loop exit points and "runs every time", and the field roles. The
 * catalog agreement lives in @byway/catalog's tests and the agreement with the runner in @byway/runner's.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ACTORS,
  audit,
  BLOCK_OF_ROLE,
  blockAgrees,
  changesWork,
  checkpoints,
  covers,
  declaresVoice,
  each,
  exitPoints,
  FIELD_ROLES,
  loop,
  matchCheckpoints,
  oneShotGate,
  optional,
  personWrite,
  pick,
  placements,
  relay,
  replicate,
  ROLES,
  route,
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
    const full = step({ id: 'x', role: 'fix', block: 'CUT', glue: 'RENDER', actor: 'model', tier: 'mid', isolated: true, frozenPrompt: true, prompt: 'p', consumes: [], produces: [], writes: true, keepsVoice: true, proxyFor: 'human', knobs: {}, variant: 'v' });
    expect(Object.keys(full).filter((k) => !(k in FIELD_ROLES.step))).toEqual([]);
    expect(Object.keys(minimalRecipe()).filter((k) => !(k in FIELD_ROLES.recipe))).toEqual([]);
    expect(FIELD_ROLES.step.id).toBe('name');
    expect(FIELD_ROLES.step.consumes).toBe('semantic-set');
    expect(FIELD_ROLES.step.variant).toBe('semantic');
    expect(FIELD_ROLES.route.id).toBe('semantic');
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
