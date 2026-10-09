/**
 * The held voice and the run-time PR6 guard (F01, ADR-0092 stage 4), driven through the real Interpreter with its
 * activities stubbed.
 *
 * - The person's words are what a VOICE write executes, not what a step declares: a human voice step that writes the
 *   work sets `ports.voice` (the latest answer, what a 'voice' consumer reads) and appends to `ports.held` (every VOICE
 *   answer on the path, which a keepsVoice writer must keep), with or without the 'voice' port. A step that only
 *   declares VOICE sets neither.
 * - A machine step that changes the work after the person's words, outside a container and without keepsVoice, fails
 *   the run before it runs (admission refuses such a recipe; this holds whatever admitted it).
 * - A C pick whose judge names no label fails instead of taking the first draft after a paid call.
 */
import { describe, expect, it, vi } from 'vitest';
import { audit, oneShotGate, pick, replicate, seq, step, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';
import { keptVoice } from '../src/activities/held-voice.ts';
import { writeProblems } from '../src/activities/writes.ts';
import type { Ports, RunInput } from '../src/types.ts';

const state = vi.hoisted(() => ({ calls: [] as { id: string; ports: Record<string, unknown> }[], scores: [] as number[], n: 0, label: 'A' as string | undefined }));

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; step?: { role: string; id: string }; ports?: Record<string, unknown> }): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        state.calls.push({ id, ports: input.ports ?? {} });
        const role = input.step?.role;
        if (role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: state.scores.shift() ?? 10 } };
        if (role === 'judge') return { costUsd: 0, ...(state.label !== undefined ? { label: state.label } : {}) };
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'finishHumanStep':
        return { costUsd: 0, text: `words of ${input.step?.id}`, artifactId: `${id}-${++state.n}` };
      case 'renderView':
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter, RunFailure } = await import('../src/workflow/interpreter.ts');

const build = (id: string, extra: Partial<Step> = {}): Step => step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true, ...extra });
const fix = (id: string, keepsVoice = false): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['artifact'], produces: ['artifact'], writes: true, ...(keepsVoice ? { keepsVoice: true } : {}) });
const voice = (id: string, extra: Partial<Step> = {}): Step => step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...extra });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });

async function run(stages: [Stage['stage'], Node][], scores: number[] = []): Promise<{ error?: unknown; ports?: Ports }> {
  state.calls = [];
  state.scores = [...scores];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'held', title: 'Held', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: stages.map(([stage, body]) => ({ stage, body })), sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-held', workspaceId: 'ws', recipe, problem: { text: 'A memo' }, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  Object.assign(engine, { ask: async (_c: unknown, spec: { kind: string }) => (spec.kind === 'confirm' ? { checkpointId: 'cp', approved: true } : spec.kind === 'write' ? { checkpointId: 'cp', text: 'x' } : { checkpointId: 'cp', choice: ['A'], text: 'x' }) });
  try {
    return { ports: await engine.runStages() };
  } catch (error) {
    return { error };
  }
}
const portsOf = (id: string) => state.calls.find((c) => c.id === id)?.ports;

describe('the held voice is what a VOICE write executes', () => {
  it("a VOICE without the 'voice' port still sets ports.voice and the held voice", async () => {
    await run([['D3', seq(build('draft'), voice('voice', { produces: ['artifact'] }), fix('polish', true))]]);
    expect(portsOf('polish')).toMatchObject({ voice: 'words of voice', held: ['words of voice'] });
  });

  it('a human vision labelled VOICE sets neither', async () => {
    const fake = step({ id: 'fake', role: 'vision', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'taste'] });
    await run([['D3', seq(build('draft'), fake, fix('polish', true))]]);
    expect(portsOf('polish')?.voice).toBeUndefined();
    expect(portsOf('polish')?.held).toBeUndefined();
  });

  it("a model step declaring 'voice' sets neither", async () => {
    await run([['D3', seq(build('draft', { produces: ['artifact', 'voice'] }), fix('polish', true))]]);
    expect(portsOf('polish')?.voice).toBeUndefined();
    expect(portsOf('polish')?.held).toBeUndefined();
  });

  it('every VOICE on the path is held, in order; ports.voice is the latest', async () => {
    await run([
      ['D1', seq(build('draft'), voice('script', { variant: 'VOICE-early' }), fix('frames', true))],
      ['D3', seq(voice('late'), fix('after-late', true))],
    ]);
    expect(portsOf('frames')).toMatchObject({ voice: 'words of script', held: ['words of script'] });
    expect(portsOf('after-late')).toMatchObject({ voice: 'words of late', held: ['words of script', 'words of late'] });
  });
});

describe('the run-time guard: no machine write over the person’s words without keepsVoice', () => {
  it('a model writer after VOICE fails the run before it runs', async () => {
    const r = await run([['D3', seq(build('draft'), voice('voice'), fix('polish'))]]);
    expect(r.error).toBeInstanceOf(RunFailure);
    expect((r.error as Error).message).toMatch(/"polish" would change the work after your own words/);
    expect(portsOf('polish')).toBeUndefined();
  });

  it("the same when the VOICE did not declare the 'voice' port", async () => {
    const r = await run([['D3', seq(build('draft'), voice('voice', { produces: ['artifact'] }), fix('polish'))]]);
    expect(r.error).toBeInstanceOf(RunFailure);
    expect(portsOf('polish')).toBeUndefined();
  });

  it('not for a writer inside an audit lens (the vanilla-overlap control runs), whose output is not kept', async () => {
    const lens = { name: 'vanilla-overlap', body: seq(replicate('vx', 2, build('vanilla')), step({ id: 'flag', role: 'overlap', actor: 'model', tier: 'mid', isolated: true, prompt: 'p.flag', consumes: ['view', 'option_set<artifact>'], produces: ['critique'] })) };
    const r = await run([['D3', seq(build('draft'), voice('voice'), render('r'), audit('reads', [lens]))]]);
    expect(r.error).toBeUndefined();
  });

  it('not in replicate(2, build > react > fix > voice): each draft has its own ports', async () => {
    const react = step({ id: 'react', role: 'vision', block: 'VISION', actor: 'human', consumes: ['artifact'], produces: ['taste'] });
    const r = await run([['D1', seq(replicate('x2', 2, seq(build('b'), react, fix('f'), voice('v'))), pick('p', 'H', 1, 'human'))]]);
    expect(r.error).toBeUndefined();
  });

  it("not on a retry's pass through the stage before the VOICE (C5 retrying D1)", async () => {
    const gate = oneShotGate('final', critic('final-critic'), { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage: 'D1', times: 1 });
    const r = await run(
      [
        ['D1', seq(build('draft'), voice('script', { variant: 'VOICE-early' }))],
        ['D2', seq(fix('frames', true), render('r'), gate)],
      ],
      [3, 10],
    );
    expect(r.error).toBeUndefined();
    expect(state.calls.filter((c) => c.id === 'draft')).toHaveLength(2);
    // The retry started D1 from its entry: the draft saw no held words the second time either.
    expect(state.calls.filter((c) => c.id === 'draft').map((c) => c.ports.held)).toEqual([undefined, undefined]);
  });
});

describe('keepsVoice keeps every held VOICE', () => {
  it('keptVoice is the latest answer and every held one, each once', () => {
    expect(keptVoice({})).toBeUndefined();
    expect(keptVoice({ voice: 'deck' })).toBe('deck');
    expect(keptVoice({ voice: 'late', held: ['script', 'late'] })).toBe('script\nlate');
  });

  it('a keepsVoice write that changes a line of an earlier VOICE (the locked script) is refused', () => {
    const before = 'Voice-over: We bake before dawn.\nHeadline: Fresh at seven';
    const after = 'Voice-over: We bake at noon.\nHeadline: Fresh at seven';
    const held = { voice: 'Fresh at seven', held: ['We bake before dawn.', 'Fresh at seven'] };
    expect(writeProblems({ seeds: [], medium: 'prose' }, after, held.voice, before)).toEqual([]);
    expect(writeProblems({ seeds: [], medium: 'prose' }, after, keptVoice(held), before)).toEqual([expect.stringMatching(/We bake before dawn/)]);
  });
});

describe('a C pick decides by its judge', () => {
  it('a judge that names no label fails the run, instead of taking draft A', async () => {
    state.label = undefined;
    const judge = step({ id: 'judge', role: 'judge', actor: 'model', tier: 'big', isolated: true, prompt: 'p.judge', consumes: ['view'], produces: [] });
    const r = await run([['D1', seq(replicate('x3', 3, build('b')), pick('choose', 'C', 1, 'model', judge))]]);
    state.label = 'A';
    expect(r.error).toBeInstanceOf(RunFailure);
    expect((r.error as Error).message).toMatch(/named no draft/);
  });
});
