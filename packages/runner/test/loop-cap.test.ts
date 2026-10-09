/**
 * Every loop exit at the cap follows one policy (F20, ADR-0093, extending ADR-0073), driven through the real
 * Interpreter with its activities stubbed.
 *
 * Before, a loop a person holds returned at its last round without asking ("Is this ready?" was skipped there, and its
 * declared onCap never read), so running out of rounds was taken as their yes; and a critic or check loop whose gate
 * never saw its critic left at the cap through the best snapshot, without asking either. Now every way out at the cap
 * goes through one turn: with onCap human and no raise yet, a person's loop asks the cap question and a critic loop
 * "Use the best version so far?"; No raises the cap once. At the raised cap a critic loop takes its best version, and
 * a person's loop asks a last choice: use this version, or stop the run (which ends it cancelled, nothing having
 * failed).
 */
import { describe, expect, it, vi } from 'vitest';
import { audit, loop, seq, step, type Gate, type Loop, type Recipe, type Step } from '@byway/recipe';
import type { RunInput } from '../src/types.ts';
import { BEST_SO_FAR_PROMPT, FINAL_CHOICE_OPTIONS, humanCapPrompt, READY_PROMPT } from '../src/workflow/wording.ts';

const state = vi.hoisted(() => ({ ran: [] as string[], n: 0 }));

vi.mock('../src/workflow/acts.ts', () => {
  const respond = (name: string, input: { call?: { stepId: string }; step?: { role: string } }): unknown => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'modelStep': {
        state.ran.push(id);
        if (input.step?.role === 'critic') return { costUsd: 0, text: '- the same gap', score: { kind: 'score', value: 3 } };
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'finishHumanStep':
        state.ran.push(id);
        return { costUsd: 0, text: 'my words', artifactId: `${id}-${++state.n}` };
      case 'renderView':
        state.ran.push(id);
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      case 'rerank':
        return { costUsd: 0, index: 0 };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => async (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter, RunStopped } = await import('../src/workflow/interpreter.ts');

const humanGate = (max: number, onCap: Gate['onCap'] = 'human'): Gate => ({ metric: 'human', hidden: false, holder: 'human', probe: 1, max, onCap, onNoConverge: 'recalibrate-human' });
const scoreGate = (max: number): Gate => ({ metric: 'critic-score', threshold: 9, hidden: true, holder: 'harness', probe: 5, max, onCap: 'human', onNoConverge: 'continue' });
const draft = step({ id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const write = step({ id: 'write', role: 'build', actor: 'human', consumes: ['artifact'], produces: ['artifact'], writes: true });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = (id: string): Step => step({ id, role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
const fix = step({ id: 'fix', role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true });

interface Asked {
  kind: string;
  prompt: string;
  options?: string[];
  artifactIds?: string[];
}

/** Run one loop after a draft; `answer` gives each question's answer (confirm: a boolean; choose: an option id). */
async function run(l: Loop, answer: (q: Asked, i: number) => boolean | string): Promise<{ asked: Asked[]; ran: string[]; error?: unknown }> {
  state.ran = [];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'cap', title: 'Cap', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: [{ stage: 'D2', body: seq(draft, l) }], sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-cap', workspaceId: 'ws', recipe, problem: { text: 'A story' }, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  const engine = new Interpreter(input, control as never);
  const asked: Asked[] = [];
  Object.assign(engine, {
    ask: async (_call: unknown, spec: { kind: string; prompt: string; options?: { id: string }[]; artifactIds?: string[] }) => {
      const q: Asked = { kind: spec.kind, prompt: spec.prompt, ...(spec.options ? { options: spec.options.map((o) => o.id) } : {}), ...(spec.artifactIds ? { artifactIds: spec.artifactIds } : {}) };
      asked.push(q);
      if (spec.kind === 'write') return { checkpointId: 'cp', text: 'my words' };
      const a = answer(q, asked.length - 1);
      return spec.kind === 'confirm' ? { checkpointId: 'cp', approved: a === true } : { checkpointId: 'cp', choice: [String(a)] };
    },
  });
  try {
    await engine.runStages();
    return { asked: asked.filter((q) => q.kind !== 'write'), ran: state.ran.slice(1) };
  } catch (error) {
    return { asked: asked.filter((q) => q.kind !== 'write'), ran: state.ran.slice(1), error };
  }
}

const prompts = (asked: Asked[]) => asked.map((q) => (q.prompt === READY_PROMPT ? 'READY' : q.prompt === BEST_SO_FAR_PROMPT ? 'BEST' : q.kind === 'choose' ? 'CHOICE' : q.prompt.startsWith('That was the last planned round') ? 'CAP' : q.prompt));

describe("a person's loop at its cap", () => {
  it('humanGate(1): the cap question is asked, and Yes keeps the version', async () => {
    const r = await run(loop('author', seq(write, render('r')), humanGate(1)), () => true);
    expect(prompts(r.asked)).toEqual(['CAP']);
    expect(r.asked[0]!.prompt).toBe(humanCapPrompt(1));
    expect(r.asked[0]!.prompt).toBe('That was the last planned round. Use this version? No allows up to 1 more round, once.');
    expect(r.error).toBeUndefined();
  });

  it('humanGate(3), No every time: Is this ready? twice, the cap question, rounds 4 to 6, then the last choice', async () => {
    const r = await run(loop('author', seq(write, render('r')), humanGate(3)), (q) => (q.kind === 'choose' ? 'use' : false));
    expect(prompts(r.asked)).toEqual(['READY', 'READY', 'CAP', 'READY', 'READY', 'CHOICE']);
    expect(r.asked[2]!.prompt).toBe('That was the last planned round. Use this version? No allows up to 3 more rounds, once.');
    expect(r.asked.at(-1)!.options).toEqual(FINAL_CHOICE_OPTIONS.map((o) => o.id));
    expect(r.ran.filter((id) => id === 'write')).toHaveLength(6);
    expect(r.error).toBeUndefined();
  });

  it("'Stop the run' at the last choice stops the run (it ends cancelled; nothing failed)", async () => {
    const r = await run(loop('author', seq(write, render('r')), humanGate(1)), (q) => (q.kind === 'choose' ? 'stop' : false));
    expect(prompts(r.asked)).toEqual(['CAP', 'CHOICE']);
    expect(r.error).toBeInstanceOf(RunStopped);
  });

  it('the cap question shows the work and the round’s notes', async () => {
    const r = await run(loop('author', seq(write, render('r')), humanGate(1)), () => true);
    expect(r.asked[0]!.artifactIds?.[0]).toMatch(/^write-/);
  });

  it('a loop a person holds that hands its cap to a policy (LS1 refuses it) ends there, as declared', async () => {
    const r = await run(loop('author', seq(write, render('r')), humanGate(2, 'policy-best-snapshot')), () => false);
    expect(prompts(r.asked)).toEqual(['READY']);
    expect(r.error).toBeUndefined();
  });
});

describe('a critic loop at its cap', () => {
  it('whose gate never sees its critic (ST2 refuses it): asks "Use the best version so far?", and No raises the cap once', async () => {
    const l = loop('blind', seq(render('r'), audit('reads', [{ name: 'critic', body: critic('c') }]), fix), scoreGate(2));
    const r = await run(l, () => false);
    expect(prompts(r.asked)).toEqual(['BEST']);
    // Two rounds, the raise, two more, then its best version without asking again.
    expect(r.ran.filter((id) => id === 'fix')).toHaveLength(4);
  });

  it('whose gate sees its critic keeps ADR-0073: asked once at the cap, the raise, then the best version', async () => {
    const l = loop('seen', seq(render('r'), critic('c'), fix), scoreGate(2));
    const r = await run(l, () => false);
    expect(prompts(r.asked)).toEqual(['BEST']);
    expect(r.ran.filter((id) => id === 'c')).toHaveLength(4);
  });
});
