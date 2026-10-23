/**
 * keepsVoice at its three call sites (port rule 6, ADR-0092 stage 4): modelStep, relayLink and assetStep each hold a
 * keepsVoice write to the held voice (held-voice.ts keptVoice: every VOICE answer on the run's path and the latest
 * words), never to the latest answer alone. Each is driven, as an activity on its own, with a held voice that differs
 * from ports.voice: the storyboard's on-screen answer held, then the voice-over script as the latest answer, so only
 * the held voice locks the on-screen words. The check each site builds is watched (writes.ts checkedWriter), and where
 * the step's own answer can change the person's words (a model's fix, an integrate answer) the refusal is shown too.
 * held-voice.test.ts pins keptVoice and the lock themselves.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '@byway/catalog';
import type { ImageResult } from '@byway/contracts';
import { steps } from '@byway/recipe';
import { assetStep } from '../src/activities/asset.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { relayLink } from '../src/activities/relay.ts';
import { INPUT_MEDIA_TYPE } from '../src/stored-inputs.ts';
import { toStepSpec, type AssetResult, type Ports, type RunRef, type StepSpec } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import type { RecordingPrompts } from './helpers/fake-prompts.ts';
import { benchRun, putWork, storyboard, voiceBench, type VoiceBench } from './helpers/voice-activity.ts';

/** The voice each keepsVoice check was built with, in order (the second argument of writes.ts checkedWriter). */
const seen = vi.hoisted(() => ({ voices: [] as unknown[] }));
vi.mock('../src/activities/writes.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/activities/writes.ts')>();
  return {
    ...real,
    checkedWriter: (...args: Parameters<typeof real.checkedWriter>) => {
      seen.voices.push(args[1]);
      return real.checkedWriter(...args);
    },
  };
});

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench();
  seen.voices = [];
});
afterEach(() => b.close());

const fenced = (text: string) => '```json\n' + text + '\n```';
const script = 'Bread before seven.';
/** The on-screen answer of a late VOICE: what the held voice keeps, and the latest answer alone does not lock. */
const onScreen = 'Headline: Fresh at seven\nTagline: Bread club\nShot 1: Hot bread\nShot 2: Oven\nShot 3: Your door';
const before = storyboard({ voiceover: script, headline: 'Fresh at seven', tagline: 'Bread club', storyboard: [{ shot: 1, caption: 'Hot bread' }, { shot: 2, caption: 'Oven' }, { shot: 3, caption: 'Your door' }] });
/** The on-screen answer held first, the voice-over script last: ports.voice is the script. */
const held: Pick<Ports, 'voice' | 'held'> = { voice: script, held: [onScreen, script] };
const ON_SCREEN_LOCKED = /on-screen copy is the person's/;

/** Completions answered from a list, each at a cent, every request kept. */
function answers(texts: string[]) {
  const left = [...texts];
  b.gateway.complete = async (req) => {
    b.gateway.requests.push(req);
    return { text: left.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${b.gateway.requests.length}` };
  };
}

/** Images stored as small PNGs, as a provider's would be. */
function images() {
  let n = 0;
  b.gateway.image = async (): Promise<ImageResult> => {
    const { id } = await b.store.artifacts.put(png(4, 3, [++n * 20, 10, 10]), 'image/png');
    return { artifactId: id, mediaType: 'image/png', servedModel: 'mock-image', provider: 'mock', costUsd: 0.04, ledgerEntryId: `i${n}` };
  };
}

describe('every keepsVoice call site holds its write to the held voice, not the latest answer alone', () => {
  const fixSpec: StepSpec = { id: 'apply-cut', role: 'fix', block: 'CUT', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const changed = before.replace('"Hot bread"', '"Hot bread, 50% off"');

  it('modelStep: a fix that changes the held on-screen words is refused; held to the latest answer alone, it would be stored', async () => {
    const fix = async (ports: Pick<Ports, 'voice' | 'held'>) => {
      const run = await benchRun(b, 'media');
      const artifact = await putWork(b, 'media', before);
      answers([fenced(changed), fenced(changed)]);
      return modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, critique: '- Sell harder.', ...ports }, refs: [] });
    };
    await expect(fix(held)).rejects.toThrow(ON_SCREEN_LOCKED);
    expect(seen.voices).toEqual([[onScreen, script]]);
    // The control: the same answer, held to the latest answer (the script) alone, is stored as written.
    const out = await fix({ voice: script });
    expect(JSON.parse(await b.store.artifacts.getText(out.artifactId!)).storyboard[0].caption).toBe('Hot bread, 50% off');
  });

  it('relayLink: the link’s write is checked against the held voice', async () => {
    const run = await benchRun(b, 'media');
    const artifact = await putWork(b, 'media', before);
    answers(['```json\n{"clipPrompt":"Shot 1: the loaf turns","durationSec":3}\n```']);
    b.gateway.video = async () => {
      const clip = await b.store.artifacts.putText('<svg/>', 'image/svg+xml');
      const frame = await b.store.artifacts.put(png(4, 3, [9, 9, 9]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', costUsd: 0, servedModel: 'mock', provider: 'mock', ledgerEntryId: 'v1' };
    };
    const relay: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true };
    const start = (await b.store.artifacts.put(png(4, 3, [1, 2, 3]), 'image/png')).id;
    const out = await relayLink(b.deps, { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: relay, ports: { artifact, anchor: start, ...held }, shot: 1 });
    expect(out.artifactId).toBeDefined();
    expect(seen.voices).toEqual([[onScreen, script]]);
  });

  it('assetStep on a storyboard (C5’s anchor frames): the attached images are checked against the held voice', async () => {
    const recipe = CATALOG.find((r) => r.id === 'c5')!;
    const frames = toStepSpec(steps(recipe).find(({ step }) => step.id === 'anchor-frames')!.step);
    expect(frames.keepsVoice).toBe(true);
    const run = await benchRun(b, 'media');
    const artifact = await putWork(b, 'media', before);
    answers([fenced(JSON.stringify({ images: [1, 2, 3].map((shot) => ({ slot: String(shot), prompt: `Shot ${shot}`, alt: `Shot ${shot}`, size: '1536x1024' })) }))]);
    images();
    const out = (await assetStep(b.deps, { run, call: { key: `${run.runId}/anchor-frames/-/1`, stepId: 'anchor-frames', stage: 'D2' }, step: frames, ports: { artifact, ...held } })) as AssetResult;
    expect(out.anchor).toBeDefined();
    expect(seen.voices).toEqual([[onScreen, script]]);
  });

  it('assetStep on a web page: an integrate answer that changes the person’s words is never placed, and the work stays as it was; one that only places the image is used', async () => {
    const assetSpec: StepSpec = { id: 'art', role: 'asset', block: 'ASSET', actor: 'model', prompt: 'product.test.art', consumes: ['artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
    const page = (body: string) => `<!doctype html><html><head><title>Memo</title></head><body>${body}</body></html>\n`;
    const words = 'Memo\nMine.';
    const briefs = fenced(JSON.stringify({ images: [{ slot: 'hero', prompt: 'A loaf', alt: 'A loaf', size: '1024x1024' }] }));
    /** An integrate answer that places the image, with `extra` added to the person's line. */
    const placing = (extra: string) => (req: { messages: unknown }) => {
      const id = /\/api\/artifacts\/sha256:[0-9a-f]{64}/.exec(JSON.stringify(req.messages))![0];
      return '```html\n' + page(`<img src="${id}" alt="A loaf"><p>Mine.${extra}</p>`) + '```';
    };
    const asset = async (integrate: ((req: { messages: unknown }) => string)[]) => {
      const run = await benchRun(b, 'web-page');
      const artifact = await putWork(b, 'web-page', page('<p>Mine.</p>'));
      images();
      const left = [() => briefs, ...integrate];
      b.gateway.requests.length = 0;
      b.gateway.complete = async (req) => {
        b.gateway.requests.push(req);
        return { text: left.shift()!(req), stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${b.gateway.requests.length}` };
      };
      const out = (await assetStep(b.deps, { run, call: { key: `${run.runId}/art/-/1`, stepId: 'art', stage: 'D2' }, step: assetSpec, ports: { artifact, voice: words, held: [words] } })) as AssetResult;
      const notes = (await b.store.events(run.runId)).filter((e) => e.type === 'step-finished').map((e) => e.data.note);
      return { out, notes };
    };
    const refused = await asset([placing(' Now 50% off!'), placing(' Now 50% off!')]);
    expect(b.gateway.requests).toHaveLength(3);
    expect(JSON.stringify(b.gateway.requests[2]!.messages)).toContain('exactly as written');
    expect(refused.out.artifactId).toBeUndefined();
    expect(refused.out.asset).toHaveLength(1);
    expect(refused.notes).toEqual(['The AI’s answer placing the image in the work could not be used, even when it was asked again, so the work is unchanged, and the image for “hero” is kept beside it.']);
    // The control: an answer that only places the image keeps the person's words, and it is the work.
    const placed = await asset([placing('')]);
    expect(await b.store.artifacts.getText(placed.out.artifactId!)).toContain('alt="A loaf"><p>Mine.</p>');
    expect(placed.out.asset).toBeUndefined();
    expect(placed.notes).toEqual([undefined]);
    expect(seen.voices).toEqual([[words], [words]]);
  });
});

/**
 * The fixed copy deck a run was given (StartRunInput.inputs.voice) is stored at start and travels as its id (P2): the
 * steps read it from its file and hold to it as the person's latest words until a VOICE answers, as when it travelled
 * as the first ports.voice.
 */
describe('a fixed copy deck the run was given, read by its id until a VOICE answers (P2)', () => {
  const fixSpec: StepSpec = { id: 'apply-cut', role: 'fix', block: 'CUT', actor: 'model', tier: 'mid', prompt: 'product.test.polish', consumes: ['critique', 'artifact'], produces: ['artifact'], writes: true, keepsVoice: true };
  const changed = before.replace('"Hot bread"', '"Hot bread, 50% off"');
  /** A run given the on-screen copy as its fixed deck, stored as Runner.start stores it. */
  const withDeck = async () => ({ ...(await benchRun(b, 'media')), voiceId: (await b.store.artifacts.putText(onScreen, INPUT_MEDIA_TYPE)).id });

  it('modelStep, relayLink and assetStep each hold a keepsVoice write to the deck; a fix that changes its words is refused', async () => {
    const fix = async (run: RunRef) => {
      const artifact = await putWork(b, 'media', before);
      answers([fenced(changed), fenced(changed)]);
      return modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact, critique: '- Sell harder.' }, refs: [] });
    };
    await expect(fix(await withDeck())).rejects.toThrow(ON_SCREEN_LOCKED);
    // The control: no deck, nothing is held, and the same answer is stored.
    expect((await fix(await benchRun(b, 'media'))).artifactId).toBeDefined();
    expect(seen.voices).toEqual([[onScreen], undefined]);

    seen.voices = [];
    const linkRun = await withDeck();
    answers(['```json\n{"clipPrompt":"Shot 1: the loaf turns","durationSec":3}\n```']);
    b.gateway.video = async () => {
      const clip = await b.store.artifacts.putText('<svg/>', 'image/svg+xml');
      const frame = await b.store.artifacts.put(png(4, 3, [9, 9, 9]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', costUsd: 0, servedModel: 'mock', provider: 'mock', ledgerEntryId: 'v1' };
    };
    const relay: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true, keepsVoice: true };
    const start = (await b.store.artifacts.put(png(4, 3, [1, 2, 3]), 'image/png')).id;
    await relayLink(b.deps, { run: linkRun, call: { key: `${linkRun.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: relay, ports: { artifact: await putWork(b, 'media', before), anchor: start }, shot: 1 });
    expect(seen.voices).toEqual([[onScreen]]);

    seen.voices = [];
    const recipe = CATALOG.find((r) => r.id === 'c5')!;
    const frames = toStepSpec(steps(recipe).find(({ step }) => step.id === 'anchor-frames')!.step);
    const assetRun = await withDeck();
    answers([fenced(JSON.stringify({ images: [1, 2, 3].map((shot) => ({ slot: String(shot), prompt: `Shot ${shot}`, alt: `Shot ${shot}`, size: '1536x1024' })) }))]);
    images();
    await assetStep(b.deps, { run: assetRun, call: { key: `${assetRun.runId}/anchor-frames/-/1`, stepId: 'anchor-frames', stage: 'D2' }, step: frames, ports: { artifact: await putWork(b, 'media', before) } });
    expect(seen.voices).toEqual([[onScreen]]);
  });

  it("a step that takes the person's words in is shown the deck; once a VOICE has answered, the answer, and the deck is not read", async () => {
    const build: StepSpec = { id: 'build', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.test.build', consumes: ['intent', 'voice'], produces: ['artifact'], writes: true };
    const prompts = b.deps.prompts as RecordingPrompts;
    const shown = async (ports: Ports) => {
      const run = await withDeck();
      answers([fenced(before)]);
      await modelStep(b.deps, { run, call: { key: `${run.runId}/build/-/1`, stepId: 'build', stage: 'D1' }, step: build, ports, refs: [] });
      return prompts.calls.at(-1)!.slots.voice;
    };
    expect(await shown({})).toBe(onScreen);
    const getText = vi.spyOn(b.store.artifacts, 'getText');
    expect(await shown({ voice: script, held: [script] })).toBe(script);
    expect(getText.mock.calls.map(([id]) => id)).not.toContain((await b.store.artifacts.putText(onScreen, INPUT_MEDIA_TYPE)).id);
  });

  it('a step that neither takes the words in nor is held to them never reads the deck, so a deck file lost since does not stop it', async () => {
    const run = { ...(await benchRun(b, 'media')), voiceId: `sha256:${'0'.repeat(64)}` };
    const fix = { ...fixSpec, keepsVoice: false };
    answers([fenced(changed)]);
    const out = await modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/1`, stepId: 'apply-cut', stage: 'D3' }, step: fix, ports: { artifact: await putWork(b, 'media', before), critique: '- Sell harder.' }, refs: [] });
    expect(out.artifactId).toBeDefined();
    // The control: held to the words, the same step reads the deck, and says plainly that its file is gone.
    answers([fenced(changed)]);
    const held = modelStep(b.deps, { run, call: { key: `${run.runId}/apply-cut/-/2`, stepId: 'apply-cut', stage: 'D3' }, step: fixSpec, ports: { artifact: await putWork(b, 'media', before), critique: '- Sell harder.' }, refs: [] });
    await expect(held).rejects.toThrow(/^The copy deck this run started with cannot be read: its file \(sha256:0{64}\) is missing or damaged/);
  });
});
