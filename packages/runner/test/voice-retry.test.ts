/**
 * VOICE-RETRY (D9, the P2 design approved 2026-10-21): a gate's retry re-enters an earlier stage from the ports it
 * started with, which drops the person's VOICE answers given since, so the second pass's VOICE offered the model's copy
 * again and an answer sent back unchanged shipped it. Now the interpreter keeps each VOICE's last answer and the deck
 * it answered, by their files' ids, carries both across the retry, and hands them to that VOICE when it is asked again;
 * the activity (human.ts openCheckpoint) starts the box from the person's earlier lines where they still fit the work,
 * and otherwise starts from the work's lines with a question that says the earlier lines could not be kept and quotes
 * them. "Unchanged" is then measured against the work's lines, so sending the earlier lines back writes them. On a deck
 * of named fields the box is made field by field (WORKFLOW-1, the owner's "Only the lines you wrote"): a field the
 * person changed from what was offered comes back as they wrote it, and a field they left as offered follows the work,
 * so the second pass's own CUT and swaps stay.
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

  it('lines that still fit: the box starts from the line the person wrote and the work’s lines for the rest, and sending it back unchanged writes both into the work delivered', async () => {
    const r = await benchRun(b, 'media');
    // The second pass writes another tagline over the same two shots (as its CUT would): the person left the tagline as
    // offered, so the second pass's tagline is the one in the box and in the work delivered, not the first pass's.
    state.works = [shots(2), shots(2, 'Loaf club')];
    const ports = await run([['D2', build('board')], ['D3', seq(voice('late'), finalCheck('D2'))]], [3, 3], { runId: r.runId, workspaceId: r.workspaceId, medium: 'media' });
    const [first, second] = opensOf('late');
    expect(second!.initialText).toBe(first!.initialText!.replace('Headline: Fresh at seven', 'Headline: Warm at six').replace('Tagline: Bread club', 'Tagline: Loaf club'));
    expect(second!.prompt).toBe(first!.prompt);
    expect(await json(ports.artifact!)).toMatchObject({ headline: 'Warm at six', tagline: 'Loaf club' });
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

describe('the box after a retry, per deck (human.ts openCheckpoint)', () => {
  /** Ask `step` on `work` as a gate's retry asks it: with an earlier answer to the deck `answered`. */
  const again = async (medium: Parameters<typeof benchRun>[1], work: string, answered: string, answer: string, step: StepSpec = voiceStep(), from: 'copy' | 'claims' = 'copy') => {
    const r = await benchRun(b, medium);
    return VoiceQuestion.open(b, r, await putWork(b, medium, work), step, from, { answerId: await kept(answer), deckId: await kept(answered) });
  };
  const late = voiceStep();
  const deck2 = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Caption 1\nShot 2: Caption 2';
  const answer2 = deck2.replace('Fresh at seven', 'Warm at six');

  it('a deck of named fields, field by field: a field the person wrote comes back as they wrote it, and a field they left as offered follows the work', async () => {
    // The person wrote the headline and shot 1's caption (on two lines) and left the tagline and shot 2 as offered. The
    // second pass then wrote another headline, tagline and captions (its CUT and swaps).
    const mine = deck2.replace('Fresh at seven', 'Warm at six').replace('Shot 1: Caption 1', 'Shot 1: First light\nand warm bread');
    const work = storyboard({ voiceover: 'We bake before dawn.', headline: 'Fresh at eight', tagline: 'Loaf club', storyboard: [{ shot: 1, caption: 'Caption one' }, { shot: 2, caption: 'Caption two' }] });
    const now = 'Headline: Fresh at eight\nTagline: Loaf club\nShot 1: Caption one\nShot 2: Caption two';
    const q = await again('media', work, deck2, mine, late);
    expect(q.offered).toBe('Headline: Warm at six\nTagline: Loaf club\nShot 1: First light\nand warm bread\nShot 2: Caption two');
    expect(q.deckId).toBe(await kept(now));
    expect(q.prompt).toBe('Write the words yourself: change any line below.');
    // Sent back unchanged it is not "unchanged": measured against the work's lines, it writes the person's fields, and
    // the fields they left as offered keep the work's lines.
    const out = await q.answer(q.offered!);
    expect(await json(out.artifactId!)).toMatchObject({ headline: 'Warm at six', tagline: 'Loaf club', storyboard: [{ caption: 'First light\nand warm bread' }, { caption: 'Caption two' }] });
    expect(out.deckId).toBe(q.deckId);
    // And the work's own lines sent back are unchanged: nothing is written.
    expect((await q.answer(now)).artifactId).toBeUndefined();
  });

  it('a work whose own deck does not read field by field: the box starts from the work’s lines and quotes the person’s', async () => {
    // The second pass's caption for shot 1 holds a line that reads as a label, so its deck has no field for the person's
    // lines to go back into; the whole earlier answer would put the first pass's caption back without saying so.
    const work = storyboard({ voiceover: 'We bake before dawn.', headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Caption 1\nTagline: odd' }, { shot: 2, caption: 'Caption 2' }] });
    const q = await again('media', work, deck2, answer2, late);
    expect(q.offered).toBe('Headline: Fresh at seven\nTagline: Bread club\nShot 1: Caption 1\nTagline: odd\nShot 2: Caption 2');
    expect(q.deckId).toBeUndefined();
    expect(q.prompt).toMatch(NOT_KEPT);
  });

  it('a deck of named fields whose lines the person wrote the work now has too: the box is the work’s lines, kept nowhere', async () => {
    const work = storyboard({ voiceover: 'We bake before dawn.', headline: 'Warm at six', tagline: 'Loaf club', storyboard: [{ shot: 1, caption: 'Caption 1' }, { shot: 2, caption: 'Caption 2' }] });
    const q = await again('media', work, deck2, answer2, late);
    expect(q.offered).toBe(answer2.replace('Bread club', 'Loaf club'));
    expect(q.deckId).toBeUndefined();
    expect(q.prompt).toBe('Write the words yourself: change any line below.');
  });

  it('a refused answer is asked again with the work’s lines still the measure: the earlier lines sent back on the re-ask are written (ENG-6)', async () => {
    const q = await again('media', shots(2), deck2, answer2, late);
    expect(q.offered).toBe(answer2);
    // A voice-over line is refused (it was locked after the script step), and the question is asked again from it.
    const bad = `${answer2}\nVoice-over: Hello.`;
    const refused = await q.answer(bad).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(AnswerRejected);
    const out = await q.reask(bad, (refused as Error).message, answer2);
    expect((await json(out.artifactId!)).headline).toBe('Warm at six');
  });

  it('options: with the same options, the person’s fields come back and the rest follow the work; another number of options does not fit', async () => {
    const opts = (titles: string[], pitch = (t: string) => `Pitch of ${t}.`) => serializeJson({ options: titles.map((title) => ({ title, pitch: pitch(title), rationale: 'Because.' })) });
    const deck = '### A\nTitle: Bread club\nPitch: Pitch of Bread club.\nRationale: Because.\n\n### B\nTitle: Weekend box\nPitch: Pitch of Weekend box.\nRationale: Because.';
    const answer = deck.replace('Title: Bread club', 'Title: Dawn loaves');
    const same = await again('options', opts(['Bread club', 'Box of the week']), deck, answer);
    expect(same.offered).toBe('### A\nTitle: Dawn loaves\nPitch: Pitch of Bread club.\nRationale: Because.\n\n### B\nTitle: Box of the week\nPitch: Pitch of Box of the week.\nRationale: Because.');
    expect(same.deckId).toBeDefined();
    // A box made so that it would not fit the work (here option B's pitch, which the person left as offered, is blank in
    // the work, and an option needs one) is not offered: the box starts from the work's lines and quotes the person's.
    const blank = await again('options', opts(['Bread club', 'Box of the week'], (t) => (t === 'Bread club' ? 'Pitch of Bread club.' : ' ')), deck, answer);
    expect(blank.offered).toMatch(/^### A\nTitle: Bread club\n[^]*\n### B\nTitle: Box of the week\nPitch: {2}\n/);
    expect(blank.deckId).toBeUndefined();
    expect(blank.prompt).toMatch(/You had written: "Title: Dawn loaves"\./);
    const three = await again('options', opts(['Bread club', 'Weekend box', 'Night bake']), deck, answer);
    expect(three.offered).toMatch(/^### A\nTitle: Bread club\n/);
    expect(three.deckId).toBeUndefined();
    expect(three.prompt).toMatch(/You had written: "Title: Dawn loaves"\./);
  });

  it('prose, only while the work’s deck has not changed', async () => {
    const memo = '# Memo\n\nWe launched on 3 May.\n';
    const mine = '# Memo\n\nWe launched on 4 May.';
    const same = await again('prose', memo, memo.trimEnd(), mine);
    expect(same.offered).toBe(mine);
    expect(same.deckId).toBeDefined();
    const changed = await again('prose', '# Memo\n\nWe launched on 3 May, in Leeds.\n', memo.trimEnd(), mine);
    expect(changed.offered).toBe('# Memo\n\nWe launched on 3 May, in Leeds.');
    expect(changed.deckId).toBeUndefined();
    expect(changed.prompt).toMatch(/You had written: "We launched on 4 May\."\. The box starts from the work's lines/);
  });

  it('a claim log is prose: its earlier corrections are the box while the claims are the same', async () => {
    const memo = '# Memo\n\nWe launched on 3 May.\n';
    const claims = await claimsOf(memo);
    const corrected = claims.replace('3 May', '4 May');
    expect(corrected).not.toBe(claims);
    const log = voiceStep({ variant: 'claim-log' });
    expect((await again('prose', memo, claims, corrected, log, 'claims')).offered).toBe(corrected);
    const more = '# Memo\n\nWe launched on 3 May.\n\nWe sold 40 loaves on 4 May.\n';
    const changed = await again('prose', more, claims, corrected, log, 'claims');
    expect(changed.offered).toBe(await claimsOf(more));
    expect(changed.deckId).toBeUndefined();
    expect(changed.prompt).toMatch(/could not be kept, because the work's lines have changed since\. You had written: "- We launched on 4 May\."\./);
  });

  it('an earlier answer that changed nothing: the box is the work’s lines and the question says nothing of it', async () => {
    const q = await again('media', shots(3), deck2, deck2, late);
    expect(q.offered).toMatch(/Shot 3: Caption 3$/);
    expect(q.deckId).toBeUndefined();
    expect(q.prompt).toBe('Write the words yourself: change any line below.');
  });

  it('many earlier lines: five are quoted, each at most 80 characters, and the rest counted', async () => {
    const answered = Array.from({ length: 7 }, (_, i) => `Line ${i + 1}.`).join('\n\n');
    const answer = Array.from({ length: 7 }, (_, i) => `Line ${i + 1}, ${'rewritten '.repeat(i === 0 ? 10 : 1)}by me.`).join('\n\n');
    const q = await again('prose', '# Another memo\n', answered, answer);
    expect(q.prompt).toMatch(/You had written: "Line 1, (rewritten ){7}r…"; "Line 2, rewritten by me\."; "Line 3, rewritten by me\."; "Line 4, rewritten by me\."; "Line 5, rewritten by me\."; and 2 more\. /);
  });

  it('a page: the box is never filled with the earlier lines, and the question names them', async () => {
    const page = '<!doctype html><html><head><title>T</title></head><body><p>Hello</p><p>World</p></body></html>';
    const q = await again('web-page', page, 'T\nHello\nWorld', 'T\nHello there\nWorld');
    expect(q.offered).toBe('T\nHello\nWorld');
    expect(q.deckId).toBeUndefined();
    expect(q.prompt).toMatch(/^Write the words yourself: change any line below\. Before the final check sent the work back, you had written: "Hello there"\. A page's lines are read again from the browser, so they are not filled in here: write them again where they still fit\. /);
  });

  it('an earlier answer whose file was lost since fails the step plainly, as a held answer does', async () => {
    const r = await benchRun(b, 'prose');
    const lost = `sha256:${'0'.repeat(64)}`;
    const err = await VoiceQuestion.open(b, r, await putWork(b, 'prose', '# Memo\n'), voiceStep(), 'copy', { answerId: lost, deckId: await kept('# Memo') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StepError);
    expect((err as Error).message).toMatch(/^Your words from an earlier step of this run cannot be read: their file \(sha256:0+\)/);
  });
});

describe('a VOICE write keeps the deck it answered beside the answer (human.ts finishHumanStep)', () => {
  it('the deck is what the box first offered, kept as a text file; the author’s own draft keeps none', async () => {
    const r = await benchRun(b, 'prose');
    const q = await VoiceQuestion.open(b, r, await putWork(b, 'prose', '# Memo\n\nWe launched on 3 May.\n'));
    const out = await q.answer(q.offered!.replace('3 May', '4 May'));
    expect(out.deckId).toBe(await kept('# Memo\n\nWe launched on 3 May.'));
    expect(await b.store.artifacts.getText(out.voiceId!)).toBe('# Memo\n\nWe launched on 4 May.');
    const draft: StepSpec = { id: 'draft', role: 'build', actor: 'human', consumes: [], produces: ['artifact'], writes: true };
    const own = await finishHumanStep(b.deps, { run: r, call: stepCall(r, 'draft'), step: draft, kind: 'write', resolution: { checkpointId: 'cp-draft', text: '# Mine\n' }, ports: {} });
    expect(own.deckId).toBeUndefined();
  });
});

/** A memo's claim lines as a claim-log VOICE offers them. */
async function claimsOf(memo: string): Promise<string> {
  const r = await benchRun(b, 'prose');
  return (await VoiceQuestion.open(b, r, await putWork(b, 'prose', memo), voiceStep({ variant: 'claim-log' }), 'claims')).offered!;
}
