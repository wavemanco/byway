/**
 * The held voice and the run-time PR6 guard (F01, ADR-0092 stage 4), driven through the real Interpreter with its
 * activities stubbed.
 *
 * - The person's words are what a VOICE write executes, not what a step declares: a human voice step that writes the
 *   work sets `ports.voice` (the latest answer, what a 'voice' consumer reads) and appends to `ports.held` (every VOICE
 *   answer on the path, which a keepsVoice writer must keep), with or without the 'voice' port. A step that only
 *   declares VOICE sets neither. Both hold the answers' ids, never their texts (P2): finishHumanStep keeps each answer
 *   as a text file, and a fixed copy deck the run was given is the first ports.voice, by its id, held by no one.
 * - A machine step that changes the work after the person's words, outside a container and without keepsVoice, fails
 *   the run before it runs (admission refuses such a recipe; this holds whatever admitted it).
 * - A C pick whose judge names no label fails instead of taking the first draft after a paid call.
 */
import { describe, expect, it, vi } from 'vitest';
import { audit, oneShotGate, pick, replicate, seq, step, type Node, type Recipe, type Stage, type Step } from '@byway/recipe';
import { keptVoice, personsWords } from '../src/activities/held-voice.ts';
import { checkedWrite, type WriteRun } from '../src/activities/writes.ts';
import { serializeJson } from '../src/formats.ts';
import type { Ports, RunInput } from '../src/types.ts';
import { UNREAD_BRIEF } from './helpers/briefs.ts';

const state = vi.hoisted(() => ({ calls: [] as { id: string; ports: Record<string, unknown> }[], scores: [] as number[], n: 0, label: 'A' as string | undefined, keepsNoId: false }));

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
        // As the activity answers a write: the text, the work it stored, and the id of the file it kept the answer in.
        return { costUsd: 0, text: `words of ${input.step?.id}`, artifactId: `${id}-${++state.n}`, ...(state.keepsNoId ? {} : { voiceId: `id of words of ${input.step?.id}` }) };
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

async function run(stages: [Stage['stage'], Node][], scores: number[] = [], inputs: RunInput['inputs'] = {}): Promise<{ error?: unknown; ports?: Ports }> {
  state.calls = [];
  state.scores = [...scores];
  const recipe: Recipe = { schema: 'byway.recipe/1', id: 'held', title: 'Held', kind: 'experimental', family: 'test', channel: 'workspace', medium: 'prose', inputs: ['intent'], stages: stages.map(([stage, body]) => ({ stage, body })), sitsOut: [], exceptions: [], bank: false };
  const input: RunInput = { runId: 'run-held', workspaceId: 'ws', recipe, problemId: UNREAD_BRIEF, profileId: 'demo', budgetUsd: 5, medium: 'prose', routes: {}, inputs };
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
    expect(portsOf('polish')).toMatchObject({ voice: 'id of words of voice', held: ['id of words of voice'] });
    // By its id only: the answer's text reaches no later step's input.
    expect(JSON.stringify(portsOf('polish'))).not.toContain('"words of voice"');
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
    expect(portsOf('frames')).toMatchObject({ voice: 'id of words of script', held: ['id of words of script'] });
    expect(portsOf('after-late')).toMatchObject({ voice: 'id of words of late', held: ['id of words of script', 'id of words of late'] });
  });

  it('a fixed copy deck the run was given is the first ports.voice, by its id, and held by no one until a VOICE answers', async () => {
    const r = await run([['D3', seq(build('draft'), fix('before', true), voice('voice'), fix('after', true))]], [], { voiceId: 'id of the deck' });
    expect(r.error).toBeUndefined();
    expect(portsOf('draft')).toMatchObject({ voice: 'id of the deck' });
    expect(portsOf('before')?.held).toBeUndefined();
    expect(portsOf('after')).toMatchObject({ voice: 'id of words of voice', held: ['id of words of voice'] });
    // A deck alone holds no machine writer back (the guard is for the person's answers), as when it travelled as text.
    expect((await run([['D1', seq(build('draft'), fix('plain'))]], [], { voiceId: 'id of the deck' })).error).toBeUndefined();
  });

  it('a VOICE write whose answer came back without its file stops the run, before any step could write over the words', async () => {
    state.keepsNoId = true;
    const r = await run([['D3', seq(build('draft'), voice('voice'), fix('polish', true))]]);
    state.keepsNoId = false;
    expect(r.error).toBeInstanceOf(RunFailure);
    expect((r.error as Error).message).toMatch(/^byway could not keep your words from step "voice"/);
    expect(portsOf('polish')).toBeUndefined();
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
  /** The person's words by id, as the activities read them (ArtifactReader.ownText): here an id is its text's name. */
  const files = new Map<string, string>();
  const reader = {
    ownText: async (id: string, unreadable: string) => {
      if (!files.has(id)) throw new Error(unreadable);
      return files.get(id)!;
    },
  };
  /** Keep a text and return its id. */
  const kept = (text: string): string => {
    files.set(`id of ${text}`, text);
    return `id of ${text}`;
  };
  const media: WriteRun = { seeds: [], medium: 'media' };
  const prose: WriteRun = { seeds: [], medium: 'prose' };
  const script = 'We bake before dawn.';
  const onScreen = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread';
  const sb = (voiceover: string, headline: string) => serializeJson({ voiceover, headline, tagline: 'Bread club', storyboard: [{ shot: 1, description: 'd1', imagePrompt: 'p1', durationSec: 3, caption: 'Hot bread' }] });
  const ON_SCREEN_LOCKED = /on-screen copy is the person's/;

  it('keptVoice is every held answer and the latest one, each once, the latest last, read by their ids', async () => {
    expect(await keptVoice(reader, {})).toBeUndefined();
    expect(await keptVoice(reader, { voice: kept('deck') })).toEqual(['deck']);
    expect(await keptVoice(reader, { voice: kept('') })).toEqual(['']);
    expect(await keptVoice(reader, { voice: kept('late'), held: [kept('script'), kept('late')] })).toEqual(['script', 'late']);
  });

  it("a lost file says whose words it held: a held answer's, else the deck's", async () => {
    await expect(personsWords(reader, { held: ['lost'] }, 'lost')).rejects.toThrow(/^Your words from an earlier step of this run cannot be read: their file \(lost\)/);
    await expect(personsWords(reader, { held: [kept('late')] }, 'lost')).rejects.toThrow(/^The copy deck this run started with cannot be read: its file \(lost\)/);
  });

  it("a keepsVoice write that changes an earlier VOICE's words is refused, where the latest answer alone lets it through", async () => {
    // The on-screen answer came first and the voice-over script last: the latest answer is the script, which locks no
    // on-screen word. Only the held voice still holds the earlier answer.
    const held = { voice: kept(script), held: [kept(onScreen), kept(script)] };
    const before = sb(script, 'Fresh at seven');
    const after = sb(script, 'Fresh at noon');
    // Control: checked against the latest answer only, the change to the earlier answer's headline is stored.
    expect(checkedWrite(media, after, script, before)).toMatchObject({ problems: [], restored: [] });
    // Checked against every held answer, as keepsVoice is, it is refused.
    expect(checkedWrite(media, after, await keptVoice(reader, held), before).problems).toEqual([expect.stringMatching(ON_SCREEN_LOCKED)]);
    expect(checkedWrite(media, before, await keptVoice(reader, held), before)).toMatchObject({ problems: [], restored: [] });
  });

  it("in prose, ADR-0081's lock holds the whole text once any answer exists, so the latest answer alone also refuses a change to an earlier VOICE's line", async () => {
    const before = 'Voice-over: We bake before dawn.\nHeadline: Fresh at seven';
    const after = 'Voice-over: We bake at noon.\nHeadline: Fresh at seven';
    const held = { voice: kept('Fresh at seven'), held: [kept('We bake before dawn.'), kept('Fresh at seven')] };
    expect(checkedWrite(prose, after, await keptVoice(reader, held), before).problems).toEqual([expect.stringMatching(/exactly as written/)]);
    expect(checkedWrite(prose, after, 'Fresh at seven', before).problems).toEqual([expect.stringMatching(/exactly as written/)]);
    expect(checkedWrite(prose, before, await keptVoice(reader, held), before).problems).toEqual([]);
  });

  it("a storyboard's on-screen answer held beside its voice-over script stays locked; the script is written back", async () => {
    const before = sb(script, 'Fresh at seven');
    const voices = await keptVoice(reader, { voice: kept(onScreen), held: [kept(script), kept(onScreen)] });
    // Joined into one text, as the held voice was first passed, the on-screen answer would not read as one, and its words would be open.
    expect(checkedWrite(media, sb(script, 'Fresh at noon'), voices, before).problems).toEqual([expect.stringMatching(ON_SCREEN_LOCKED)]);
    const r = checkedWrite(media, sb('We bake at noon.', 'Fresh at seven'), voices, before);
    expect(r).toMatchObject({ problems: [], restored: ['voice-over'] });
    expect(JSON.parse(r.text).voiceover).toBe(script);
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
