/**
 * What a page's VOICE asks, as shown (ADR-0081; R-SUFFIX in the approved P2 design): the workflow's question for the
 * VOICE, then how a page's copy is written in the box, read from the page itself (one line per block of text, the
 * bracket rule, where each link goes). The P2 design moves only the fixed sentence of that suffix into the workflow's
 * wording; the rest is read from the page by the activity, since the copy code may never be bundled into the workflow.
 * No shown text changes: these tests pin the stored prompts, through the real Interpreter on the real openCheckpoint and
 * finishHumanStep (a temp store, a real browser), at the first offer, on a re-ask after a refusal (ENG-6), which
 * carries the sentence once, and when a gate's retry asks the VOICE again (VOICE-RETRY), whose note on the person's
 * earlier lines comes after the question and before the page's rules. A page VOICE with no work to read gets no page
 * rules, as before, and a VOICE on any other medium none at all.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckpointResolution } from '@byway/contracts';
import { oneShotGate, seq, step, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';
import { playwrightPages } from '../src/pages.ts';
import type { RunInput } from '../src/types.ts';
import { humanPrompt, PAGE_LINES_RULE } from '../src/workflow/wording.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';
import { benchRun, voiceBench, type VoiceBench } from './helpers/voice-activity.ts';

const state = vi.hoisted(() => ({
  bench: undefined as unknown as { deps: unknown; store: { getCheckpoint(id: string): Promise<{ prompt: string; initialText?: string } | undefined>; resolveCheckpoint(r: unknown): Promise<unknown>; artifacts: { putText(t: string, m: string): Promise<{ id: string }> } } },
  control: undefined as unknown as { pending: Map<string, { resolution?: unknown }> },
  /** The work the build step writes, and its media type. */
  work: { text: '', mediaType: 'text/html' },
  /** What the person writes at each VOICE question, in order: a function of the box. Once they run out, the box as offered. */
  writes: [] as ((box: string) => string)[],
  /** The final check's scores, in order; a pass once they run out. */
  scores: [] as number[],
  /** Each VOICE question as stored: its prompt and the box it opened with. */
  asked: [] as { prompt: string; initialText?: string }[],
}));

vi.mock('@temporalio/workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@temporalio/workflow')>()),
  // Every question here is answered while it is being opened (below), as the Update would answer it later.
  condition: async (done: () => boolean) => {
    if (!done()) throw new Error('a question was left unanswered');
  },
}));

vi.mock('../src/workflow/acts.ts', () => {
  const real = async <T>(fn: () => Promise<T>): Promise<T> => {
    const { toFailure } = await import('../src/activities/failures.ts');
    try {
      return await fn();
    } catch (e) {
      throw toFailure(e);
    }
  };
  const respond = async (name: string, input: { checkpoint?: { id: string }; step?: { role: string } }): Promise<unknown> => {
    const human = await import('../src/activities/human.ts');
    switch (name) {
      case 'openCheckpoint': {
        // A refused answer is asked again; a test whose answers are refused every time fails here instead of hanging.
        if (state.asked.length >= 5) throw new Error('the VOICE was asked five times: its answers are refused every time');
        const opened = await real(() => human.openCheckpoint(state.bench.deps as never, input as never));
        const stored = (await state.bench.store.getCheckpoint(opened.checkpointId))!;
        state.asked.push({ prompt: stored.prompt, ...(stored.initialText !== undefined ? { initialText: stored.initialText } : {}) });
        const resolution: CheckpointResolution = { checkpointId: input.checkpoint!.id, text: (state.writes.shift() ?? ((box) => box))(stored.initialText ?? '') };
        await state.bench.store.resolveCheckpoint(resolution);
        state.control.pending.get(input.checkpoint!.id)!.resolution = resolution;
        return opened;
      }
      case 'finishHumanStep':
        return real(() => human.finishHumanStep(state.bench.deps as never, input as never));
      case 'modelStep':
        if (input.step?.role === 'critic') return { costUsd: 0, text: '- a gap', score: { kind: 'score', value: state.scores.shift() ?? 10 } };
        return { costUsd: 0, artifactId: (await state.bench.store.artifacts.putText(state.work.text, state.work.mediaType)).id };
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

const build: Step = step({ id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'p.build', consumes: ['intent'], produces: ['artifact'], writes: true });
const voice = (extra: Partial<Step> = {}): Step => step({ id: 'words', role: 'voice', block: 'VOICE', actor: 'human', consumes: ['artifact'], produces: ['voice', 'artifact'], writes: true, ...extra });
const render = step({ id: 'feed', role: 'render', glue: 'RENDER', actor: 'tool', consumes: ['artifact'], produces: ['view'] });
const critic = step({ id: 'final-critic', role: 'critic', block: 'CRITIC', actor: 'model', tier: 'big', isolated: true, frozenPrompt: true, prompt: 'p.critic', consumes: ['view'], produces: ['critique', 'score'] });
/** The final check: a critic's score of 7 passes; a fail sends the run back to `stage` once. */
const finalCheck = (stage: Stage['stage']): Node => seq(render, oneShotGate('launch-gate', critic, { metric: 'critic-score', threshold: 7, hidden: true, holder: 'harness' }, { stage, times: 1 }));

const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench([], { pages: chromium });
  state.bench = b as never;
  state.asked = [];
  state.writes = [];
  state.scores = [];
});
afterEach(() => b.close());

/** Run `stages` (one stage D2 of `body` when a node is given) on `medium` through the real Interpreter, over the bench's store. */
async function run(body: Node | [Stage['stage'], Node][], medium: RunInput['medium']): Promise<void> {
  const r = await benchRun(b, medium);
  const stages = Array.isArray(body) ? body.map(([stage, node]) => ({ stage, body: node })) : [{ stage: 'D2' as const, body }];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'page-voice', title: 'Page voice', kind: 'experimental', family: 'test', channel: 'workspace', medium, inputs: ['intent'], stages, sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: r.runId, workspaceId: r.workspaceId, recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium, routes: {}, inputs: {} };
  const control = { boundary: async () => {}, machine: <T>(fn: () => Promise<T>) => fn(), track: <T>(fn: () => Promise<T>) => fn(), pending: new Map() };
  state.control = control;
  await new Interpreter(input, control as never).runStages();
}

const PAGE = '<!doctype html><html><head><title>T</title></head><body><h1>Fresh bread</h1><p>Order <a href="/order">here</a> today.</p></body></html>';
const ASKED = 'Write the words yourself: change any line below. Your lines are used exactly as you write them.';
const RULES =
  'One line per block of text; leave a line empty to remove its text. Words in [brackets] are a link\'s words: keep one pair of brackets per link, in order, and leave a pair empty, [], to remove that link. To write a bracket as text, put \\ before it. Links stay where they are; only their words change. Where each one goes: line 3 "here" goes to /order.';

describe("a page VOICE's question as shown: the workflow's question, then how a page's copy is written", () => {
  it('the first offer, and the re-ask after a refusal, which says why and carries the page rules once', async () => {
    state.work = { text: PAGE, mediaType: 'text/html' };
    // A line added is refused (no block to go in), and asked again from what the person wrote; then the fix is placed.
    state.writes = [(box) => `${box}\nA line of my own.`, () => 'T\nFresh loaves\nOrder [here] today.'];
    await run(seq(build, voice()), 'web-page');
    const [first, again] = state.asked;
    expect(first).toEqual({ prompt: `${ASKED} ${RULES}`, initialText: 'T\nFresh bread\nOrder [here] today.' });
    expect(again!.initialText).toBe('T\nFresh bread\nOrder [here] today.\nA line of my own.');
    const problem = again!.prompt.slice(0, again!.prompt.indexOf(ASKED));
    expect(problem).toMatch(/^This page has one line per block of text: 3 lines, and your text has 4\. /);
    expect(again!.prompt).toBe(`${problem}${ASKED} ${RULES}`);
    expect(again!.prompt.split('One line per block of text;')).toHaveLength(2);
    expect(state.asked).toHaveLength(2);
  });

  it('a claim log on a page is asked as a claim log, with the same page rules after it', async () => {
    state.work = { text: PAGE, mediaType: 'text/html' };
    await run(seq(build, voice({ variant: 'claim-log' })), 'web-page');
    expect(state.asked.map((a) => a.prompt)).toEqual([
      `Sign off every number, date, name and causal claim below, one per line: correct any that is wrong, and your correction replaces it in the document. Leave just "-" on a line to take that claim out. You own them. ${RULES}`,
    ]);
  });

  it('asked again after the final check sent the work back: the note on the earlier lines follows the question, the page rules follow it', async () => {
    state.work = { text: PAGE, mediaType: 'text/html' };
    state.scores = [3, 10];
    state.writes = [(box) => box.replace('Fresh bread', 'Fresh loaves')];
    await run([['D2', seq(build, voice())], ['D3', finalCheck('D2')]], 'web-page');
    const note = 'Before the final check sent the work back, you had written: "Fresh loaves". A page\'s lines are read again from the browser, so they are not filled in here: write them again where they still fit.';
    expect(state.asked.map((a) => a.prompt)).toEqual([`${ASKED} ${RULES}`, `${ASKED} ${note} ${RULES}`]);
  });

  it("the workflow's part: a page VOICE's question ends with the line rule when its work is in front of it, and no other does", () => {
    const page = { medium: 'web-page' as const, page: true };
    expect(PAGE_LINES_RULE).toBe('One line per block of text; leave a line empty to remove its text.');
    expect(humanPrompt(voice(), undefined, false, page)).toBe(`${ASKED} ${PAGE_LINES_RULE}`);
    expect(humanPrompt(voice({ variant: 'claim-log' }), undefined, false, page)).toMatch(/ You own them\. One line per block of text; leave a line empty to remove its text\.$/);
    expect(humanPrompt(voice(), undefined, false, { medium: 'web-page' })).toBe(ASKED);
    expect(humanPrompt(voice(), undefined, false, { medium: 'prose' })).toBe(ASKED);
  });

  it('a page VOICE with no work to read gets no page rules, and a VOICE on another medium none', async () => {
    // With no work in front of it, the person's page is their draft.
    state.writes = [() => PAGE];
    await run(voice(), 'web-page');
    expect(state.asked.map((a) => a.prompt)).toEqual([ASKED]);
    state.asked = [];
    state.work = { text: '# Fresh bread\n\nOrder here today.', mediaType: 'text/markdown' };
    await run(seq(build, voice()), 'prose');
    expect(state.asked.map((a) => a.prompt)).toEqual([ASKED]);
  });
});
