/**
 * VOICE-RETRY (D9, the P2 design approved 2026-10-21): a gate's retry re-enters an earlier stage from the ports it
 * started with, which drops the person's VOICE answers given since, so the second pass's VOICE offered the model's copy
 * again and an answer sent back unchanged shipped it. Now the interpreter keeps each VOICE's last answer and the deck
 * it answered, by their files' ids, carries both across the retry, and hands them to that VOICE when it is asked again;
 * the activity (human.ts openCheckpoint) starts the box from the person's earlier lines where they still fit the work,
 * and otherwise starts from the work's lines with a question that says the earlier lines could not be kept and quotes
 * them. "Unchanged" is then measured against the work's lines, so sending the earlier lines back writes them.
 *
 * Three ways in: the real Interpreter with its activities stubbed (what it carries, and to which VOICE); the real
 * Interpreter on the real openCheckpoint and finishHumanStep over a temp store (a storyboard's second late VOICE, whose
 * lines fit or no longer fit); and the activities on their own, per kind of deck.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointOption, CheckpointResolution } from '@byway/contracts';
import { loop, oneShotGate, pick, replicate, seq, step, type Gate, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';
import { AnswerRejected, StepError } from '../src/activities/failures.ts';
import { finishHumanStep } from '../src/activities/human.ts';
import { serializeJson } from '../src/formats.ts';
import { playwrightPages } from '../src/pages.ts';
import { INPUT_MEDIA_TYPE } from '../src/stored-inputs.ts';
import type { EarlierAnswer, Ports, RunInput, StepSpec } from '../src/types.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';
import { benchRun, putWork, stepCall, storyboard, voiceBench, VoiceQuestion, voiceStep, type VoiceBench } from './helpers/voice-activity.ts';

vi.setConfig({ testTimeout: 60_000 });

type Opened = { stepId: string; initial?: { earlier?: EarlierAnswer }; prompt: string; initialText?: string };
type Finished = { stepId: string; deckId?: string; initialText?: string; voiceId?: string; deckOut?: string };

const state = vi.hoisted(() => ({
  /** Stubbed (false) or the real human activities on `bench` (true). */
  real: false,
  bench: undefined as unknown as { deps: unknown; store: { getCheckpoint(id: string): Promise<{ prompt: string; initialText?: string } | undefined>; resolveCheckpoint(r: unknown): Promise<unknown>; artifacts: { putText(t: string, m: string): Promise<{ id: string }> } } },
  control: undefined as unknown as { pending: Map<string, { resolution?: unknown }> },
  scores: [] as number[],
  works: [] as string[],
  /** The stub's openCheckpoint starts the box from the earlier lines (returns a deckId) when it is handed them. */
  keepsEarlier: true,
  opens: [] as Opened[],
  finishes: [] as Finished[],
  /** What the person writes at a write question: a function of its step, its box and how often it was asked. */
  write: (_stepId: string, box: string | undefined, _n: number): string => box ?? '',
  /** The answers to a loop's "Is this ready?", in order; yes once they run out. */
  readies: [] as boolean[],
  /** How often each step's write question was asked in this run. */
  asked: new Map<string, number>(),
  n: 0,
}));

vi.mock('@temporalio/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@temporalio/workflow')>()),
  // Every question here is answered while it is being opened (below), as the Update would answer it later.
  condition: async (done: () => boolean) => {
    if (!done()) throw new Error('a question was left unanswered');
  },
}));

vi.mock('../src/workflow/acts.ts', () => {
  type Input = {
    call?: { stepId: string; key: string };
    step?: { role: string; id: string };
    kind?: string;
    checkpoint?: { id: string; kind: string; options?: CheckpointOption[]; k?: number; prompt: string; initialText?: string };
    initial?: { earlier?: EarlierAnswer };
    deckId?: string;
    initialText?: string;
    resolution?: CheckpointResolution;
  };
  /** The person's answer to a question: yes, the first options, or what `state.write` writes in the box. */
  const answer = (input: Input, box: string | undefined): CheckpointResolution => {
    const cp = input.checkpoint!;
    if (cp.kind === 'confirm') return { checkpointId: cp.id, approved: cp.prompt.startsWith('Is this ready?') ? (state.readies.shift() ?? true) : true };
    if (cp.kind === 'write') {
      const n = (state.asked.get(input.call!.stepId) ?? 0) + 1;
      state.asked.set(input.call!.stepId, n);
      return { checkpointId: cp.id, text: state.write(input.call!.stepId, box, n) };
    }
    return { checkpointId: cp.id, choice: (cp.options ?? []).slice(0, cp.k ?? 1).map((o) => o.id), text: 'x' };
  };
  const real = async <T>(fn: () => Promise<T>): Promise<T> => {
    const { toFailure } = await import('../src/activities/failures.ts');
    try {
      return await fn();
    } catch (e) {
      throw toFailure(e);
    }
  };
  const respond = async (name: string, input: Input): Promise<unknown> => {
    const id = input.call?.stepId ?? '';
    switch (name) {
      case 'openCheckpoint': {
        let opened: { checkpointId: string; initialText?: string; deckId?: string };
        let prompt = input.checkpoint!.prompt;
        if (state.real) {
          const human = await import('../src/activities/human.ts');
          opened = await real(() => human.openCheckpoint(state.bench.deps as never, input as never));
          prompt = (await state.bench.store.getCheckpoint(opened.checkpointId))!.prompt;
        } else {
          const box = input.checkpoint!.kind === 'write' ? (state.keepsEarlier && input.initial?.earlier ? `earlier lines of ${id}` : `deck of ${input.call!.key}`) : undefined;
          opened = { checkpointId: input.checkpoint!.id, ...(box !== undefined ? { initialText: box } : {}), ...(state.keepsEarlier && input.initial?.earlier ? { deckId: `work deck of ${input.call!.key}` } : {}) };
        }
        state.opens.push({ stepId: id, ...(input.initial ? { initial: input.initial } : {}), prompt, ...(opened.initialText !== undefined ? { initialText: opened.initialText } : {}) });
        const resolution = answer(input, opened.initialText ?? input.checkpoint!.initialText);
        if (state.real) await state.bench.store.resolveCheckpoint(resolution);
        state.control.pending.get(input.checkpoint!.id)!.resolution = resolution;
        return opened;
      }
      case 'finishHumanStep': {
        let fin: { costUsd: number; text?: string; artifactId?: string; voiceId?: string; deckId?: string };
        if (state.real) {
          const human = await import('../src/activities/human.ts');
          fin = await real(() => human.finishHumanStep(state.bench.deps as never, input as never));
        } else {
          const voice = input.kind === 'write' && input.step?.role === 'voice';
          const n = ++state.n;
          fin = { costUsd: 0, text: input.resolution?.text ?? '', artifactId: `${id}-${n}`, ...(voice ? { voiceId: `answer ${n} of ${id}`, deckId: input.deckId ?? `deck ${n} of ${id}` } : {}) };
        }
        state.finishes.push({ stepId: id, ...(input.deckId !== undefined ? { deckId: input.deckId } : {}), ...(input.initialText !== undefined ? { initialText: input.initialText } : {}), ...(fin.voiceId ? { voiceId: fin.voiceId } : {}), ...(fin.deckId ? { deckOut: fin.deckId } : {}) });
        return fin;
      }
      case 'modelStep': {
        if (input.step?.role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: state.scores.shift() ?? 10 } };
        if (state.real) return { costUsd: 0, artifactId: (await state.bench.store.artifacts.putText(state.works.shift()!, 'application/json')).id };
        return { costUsd: 0, artifactId: `${id}-${++state.n}` };
      }
      case 'renderView':
        return { costUsd: 0, view: { pool: false, items: [{ imageArtifactIds: [] }] } };
      default:
        return undefined;
    }
  };
  const group = () => new Proxy({}, { get: (_t, name: string) => (input: never) => respond(name, input) });
  return { quick: group(), model: group(), media: group() };
});

const { Interpreter } = await import('../src/workflow/interpreter.ts');

const build = (id: string): Step => step({ id, role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const fix = (id: string): Step => step({ id, role: 'fix', actor: 'model', tier: 'mid', prompt: 'p.fix', consumes: ['artifact'], produces: ['artifact'], writes: true, keepsVoice: true });
const voice = (id: string, extra: Partial<Step> = {}): Step => step({ id, role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...extra });
const render = (id: string): Step => step({ id, role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = step({ id: 'final-critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
/** The final check: a critic's score of 7 passes; a fail sends the run back to `stage`, `times` times, then asks. */
const finalCheck = (stage: Stage['stage'], times = 1): Node => seq(render('feed'), oneShotGate('launch-gate', critic, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage, times }));

async function run(stages: [Stage['stage'], Node][], scores: number[], opts: { runId?: string; workspaceId?: string; medium?: RunInput['medium'] } = {}): Promise<Ports> {
  state.opens = [];
  state.finishes = [];
  state.asked = new Map();
  state.scores = [...scores];
  const medium = opts.medium ?? 'prose';
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'retry', title: 'Retry', kind: 'experimental', family: 'test', channel: 'workspace', medium, inputs: ['intent'], stages: stages.map(([stage, body]) => ({ stage, body })), sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: opts.runId ?? 'run-retry', workspaceId: opts.workspaceId ?? 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium, routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  state.control = control;
  return new Interpreter(input, control as never).runStages();
}
const opensOf = (id: string) => state.opens.filter((o) => o.stepId === id);
const finishesOf = (id: string) => state.finishes.filter((f) => f.stepId === id);

describe('the interpreter carries each VOICE answer across a gate’s retry, to that VOICE asked again', () => {
  beforeEach(() => {
    state.real = false;
    state.keepsEarlier = true;
    state.write = (_id, box) => `${box} (changed)`;
  });

  it('the late VOICE asked again gets its last answer and the deck it answered; its finish is measured against the work’s lines', async () => {
    await run(
      [
        ['D1', seq(build('draft'), voice('script', { variant: 'VOICE-early' }))],
        ['D2', fix('frames')],
        ['D3', seq(voice('late'), finalCheck('D2'))],
      ],
      [3, 3],
    );
    const [first, second] = finishesOf('late');
    expect(opensOf('late').map((o) => o.initial?.earlier)).toEqual([undefined, { answerId: first!.voiceId, deckId: first!.deckOut }]);
    // The first answer was measured against what it was offered; the second against the work's lines the open named.
    expect(first).not.toHaveProperty('deckId');
    expect(second).toMatchObject({ deckId: expect.stringMatching(/^work deck of /), initialText: 'earlier lines of late' });
    // The script's stage did not run again: it was asked once, with nothing earlier.
    expect(opensOf('script').map((o) => o.initial?.earlier)).toEqual([undefined]);
  });

  it('a retry into the VOICE’s own stage carries it too, and so does each VOICE after it; a second retry carries the latest answers', async () => {
    await run(
      [
        ['D1', seq(build('draft'), voice('script', { variant: 'VOICE-early' }), fix('frames'))],
        ['D3', seq(voice('late'), finalCheck('D1', 2))],
      ],
      [3, 3, 3],
    );
    const scripts = finishesOf('script');
    const lates = finishesOf('late');
    expect(scripts).toHaveLength(3);
    expect(opensOf('script').map((o) => o.initial?.earlier)).toEqual([undefined, { answerId: scripts[0]!.voiceId, deckId: scripts[0]!.deckOut }, { answerId: scripts[1]!.voiceId, deckId: scripts[1]!.deckOut }]);
    expect(opensOf('late').map((o) => o.initial?.earlier)).toEqual([undefined, { answerId: lates[0]!.voiceId, deckId: lates[0]!.deckOut }, { answerId: lates[1]!.voiceId, deckId: lates[1]!.deckOut }]);
  });

  it('a VOICE in each branch of a fan-out gets its own branch’s answer', async () => {
    await run(
      [
        ['D2', seq(replicate('drafts', 2, seq(build('b'), voice('v'))), pick('choose', 'H', 1, 'human'))],
        ['D3', finalCheck('D2')],
      ],
      [3, 10],
    );
    const v = finishesOf('v');
    expect(v).toHaveLength(4);
    const earlier = opensOf('v').slice(2).map((o) => o.initial?.earlier?.answerId);
    // The branches run concurrently, so pair them by the answer each carried: each second-pass branch carries one of the
    // first pass's answers, and the two carry different ones.
    expect(new Set(earlier)).toEqual(new Set([v[0]!.voiceId, v[1]!.voiceId]));
  });

  it('an open that starts from the work’s lines names no deck, and the finish gets none', async () => {
    state.keepsEarlier = false;
    await run([['D2', build('draft')], ['D3', seq(voice('late'), finalCheck('D2'))]], [3, 3]);
    expect(opensOf('late')[1]!.initial?.earlier).toBeDefined();
    expect(finishesOf('late').map((f) => f.deckId)).toEqual([undefined, undefined]);
  });

  it('a VOICE in a loop takes its carried answer once: its next round in the same pass is asked as any round is', async () => {
    const rounds = loop('rounds', seq(voice('late'), render('r')), { metric: 'human', hidden: false, holder: 'human', probe: 1, max: 3, onCap: 'human', onNoConverge: 'recalibrate-human' } as Gate);
    state.readies = [false, true, false, true];
    await run([['D2', build('draft')], ['D3', seq(rounds, finalCheck('D2'))]], [3, 10]);
    const f = finishesOf('late');
    expect(f).toHaveLength(4);
    expect(opensOf('late').map((o) => o.initial?.earlier)).toEqual([undefined, undefined, { answerId: f[1]!.voiceId, deckId: f[1]!.deckOut }, undefined]);
  });

  it('nothing is carried without a retry', async () => {
    await run([['D2', build('draft')], ['D3', seq(voice('late'), finalCheck('D2'))]], [10]);
    expect(opensOf('late').map((o) => o.initial?.earlier)).toEqual([undefined]);
  });
});

// ---- The real activities ---------------------------------------------------------------------------------------

const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench([], { pages: chromium });
  state.bench = b as never;
});
afterEach(() => b.close());

const json = async (id: string) => JSON.parse(await b.store.artifacts.getText(id)) as Record<string, unknown>;
const kept = async (text: string) => (await b.store.artifacts.putText(text, INPUT_MEDIA_TYPE)).id;
const shots = (n: number, tagline = 'Bread club') => storyboard({ voiceover: 'We bake before dawn.', headline: 'Fresh at seven', tagline, storyboard: Array.from({ length: n }, (_, i) => ({ shot: i + 1, caption: `Caption ${i + 1}` })) });
const NOT_KEPT = /Your lines from before the final check sent the work back could not be kept, because the work's lines have changed since\. You had written: "Headline: Warm at six"\. The box starts from the work's lines: write yours again where they still fit\.$/;

describe('the interpreter on the real activities: a storyboard’s late VOICE after the final check sent the work back', () => {
  beforeEach(() => {
    state.real = true;
    // The first late VOICE changes the headline; the second sends its box back as it was offered.
    state.write = (_id, box, n) => (n === 1 ? box!.replace('Headline: Fresh at seven', 'Headline: Warm at six') : box!);
  });

  it('lines that still fit: the box starts from them, and sending it back unchanged writes them into the work delivered', async () => {
    const r = await benchRun(b, 'media');
    // The second pass's model writes another tagline over the same two shots.
    state.works = [shots(2), shots(2, 'Loaf club')];
    const ports = await run([['D2', build('board')], ['D3', seq(voice('late'), finalCheck('D2'))]], [3, 3], { runId: r.runId, workspaceId: r.workspaceId, medium: 'media' });
    const [first, second] = opensOf('late');
    expect(second!.initialText).toBe(first!.initialText!.replace('Headline: Fresh at seven', 'Headline: Warm at six'));
    expect(second!.prompt).toBe(first!.prompt);
    expect((await json(ports.artifact!)).headline).toBe('Warm at six');
    expect(finishesOf('late')[1]!.deckId).toBeDefined();
  });

  it('lines that no longer fit (another number of shots): the box starts from the work’s lines, and the question quotes the earlier ones', async () => {
    const r = await benchRun(b, 'media');
    state.works = [shots(2), shots(3)];
    const ports = await run([['D2', build('board')], ['D3', seq(voice('late'), finalCheck('D2'))]], [3, 3], { runId: r.runId, workspaceId: r.workspaceId, medium: 'media' });
    const second = opensOf('late')[1]!;
    expect(second.initialText).toBe('Headline: Fresh at seven\nTagline: Bread club\nShot 1: Caption 1\nShot 2: Caption 2\nShot 3: Caption 3');
    expect(second.prompt).toMatch(NOT_KEPT);
    // Sent back as offered, it writes nothing: the work delivered has the model's headline.
    expect((await json(ports.artifact!)).headline).toBe('Fresh at seven');
    expect(finishesOf('late')[1]).not.toHaveProperty('deckId');
  });
});

describe('PROBE: a field the person left as offered in pass 1', () => {
  beforeEach(() => {
    state.real = true;
    state.write = (_id, box, n) => (n === 1 ? box!.replace('Headline: Fresh at seven', 'Headline: Warm at six') : box!);
  });
  it('pass 2 changed the tagline (as the person\'s own CUT would); the second late VOICE is sent back as offered', async () => {
    const r = await benchRun(b, 'media');
    state.works = [shots(2), shots(2, 'Loaf club')];
    const ports = await run([['D2', build('board')], ['D3', seq(voice('late'), finalCheck('D2'))]], [3, 3], { runId: r.runId, workspaceId: r.workspaceId, medium: 'media' });
    const [first, second] = opensOf('late');
    console.log('PROBE first box:', JSON.stringify(first!.initialText));
    console.log('PROBE second box:', JSON.stringify(second!.initialText));
    console.log('PROBE second prompt:', JSON.stringify(second!.prompt));
    const delivered = await json(ports.artifact!);
    console.log('PROBE delivered headline/tagline:', delivered.headline, '/', delivered.tagline);
  });
});
