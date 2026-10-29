/**
 * PR3 reads the run's SEED strings from the store (P2). A SEED step's random string is memoized for its step call in
 * the run's seed range (writes.ts seedMemoKey), and RunRef no longer carries the seeds handed out so far: every write
 * check reads them there, all at once (runSeeds). So it sees a superset of what once travelled in the input (a
 * sibling's seed handed out while this step waited or ran, an earlier stage run's): stricter, never looser.
 *
 * Each writer is driven as an activity on its own, with another step's seed kept in the store and none in the step's
 * input: the model's builder (asked again), a seed's written direction (redacted), the author's own draft, VOICE on
 * prose, in a claim log and on a page (the page reader's model standing in for Chromium), a relay link's storyboard and
 * an asset step's attached images.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CATALOG } from '@byway/catalog';
import type { ImageResult } from '@byway/contracts';
import { steps } from '@byway/recipe';
import { assetStep } from '../src/activities/asset.ts';
import { AnswerRejected } from '../src/activities/failures.ts';
import { finishHumanStep } from '../src/activities/human.ts';
import { memoized } from '../src/activities/memo.ts';
import { modelStep } from '../src/activities/model-step.ts';
import { DEFAULT_RELAY_WAITS, relayLink } from '../src/activities/relay.ts';
import { runSeeds, seedMemoKey } from '../src/activities/writes.ts';
import { toStepSpec, type RunRef, type StepCall, type StepSpec } from '../src/types.ts';
import { fakePages, png } from './helpers/fake-pages.ts';
import { benchRun, putWork, stepCall, storyboard, voiceBench, VoiceQuestion, voiceStep, type VoiceBench } from './helpers/voice-activity.ts';

let b: VoiceBench;
beforeEach(async () => {
  b = await voiceBench([], { pages: fakePages() });
});
afterEach(() => b.close());

/** Another step's random string (48 characters, as the runner's are), handed out earlier in the run. */
const SIBLING = `sibling${'Q'.repeat(41)}`;
/** PR3's refusal to a person, who is asked again (ENG-6): written for them, not for a model. */
const PR3 = /^Your text holds a random string this run gave the AI, which never goes into the work: take it out\./;

/** The sibling's seed, kept as the runner keeps one: memoized for its own step call in the run's seed range. */
const siblingSeed = (run: RunRef) => memoized(b.store, run.runId, seedMemoKey({ key: `${run.runId}/seed/0/1` }), () => SIBLING);

/** Completions answered from a list, every request kept. */
function answers(texts: string[]) {
  const left = [...texts];
  b.gateway.complete = async (req) => {
    b.gateway.requests.push(req);
    return { text: left.shift() ?? '', stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${b.gateway.requests.length}` };
  };
}

const callOf = (run: RunRef, stepId: string, stage: StepCall['stage'] = 'D1'): StepCall => ({ key: `${run.runId}/${stepId}/-/1`, stepId, stage });

describe("a SEED step's string is kept in the run's seed range", () => {
  const spark: StepSpec = { id: 'spark', role: 'seed', block: 'SEED', actor: 'model', tier: 'mid', prompt: 'product.test.spark', consumes: ['intent'], produces: ['artifact'], writes: true };

  it('once per step call, the same on a retry; the range holds every step call’s, and only the run’s', async () => {
    let n = 0;
    const deps = { ...b.deps, seed: () => `seed-${++n}-${'x'.repeat(40)}` };
    const run = await benchRun(b, 'prose');
    const other = await benchRun(b, 'prose');
    answers(Array<string>(4).fill('```markdown\n# Spark\n```'));
    await modelStep(deps, { run, call: callOf(run, 'spark'), step: spark, ports: {}, refs: [] });
    await modelStep(deps, { run, call: callOf(run, 'spark'), step: spark, ports: {}, refs: [] });
    expect(await runSeeds(b.store, run.runId)).toEqual([`seed-1-${'x'.repeat(40)}`]);
    await modelStep(deps, { run, call: { ...callOf(run, 'spark'), key: `${run.runId}/spark/-/2` }, step: spark, ports: {}, refs: [] });
    await modelStep(deps, { run: other, call: callOf(other, 'spark'), step: spark, ports: {}, refs: [] });
    expect(await runSeeds(b.store, run.runId)).toEqual([`seed-1-${'x'.repeat(40)}`, `seed-2-${'x'.repeat(40)}`]);
    expect(await runSeeds(b.store, other.runId)).toEqual([`seed-3-${'x'.repeat(40)}`]);
    // The step's other memos (its answer, here) are not in the range.
    expect(await b.store.getMemo(run.runId, seedMemoKey(callOf(run, 'spark')))).toBe(`seed-1-${'x'.repeat(40)}`);
  });

  it("its written direction never holds another step's seed either: both are kept out of the note", async () => {
    const run = await benchRun(b, 'prose');
    await siblingSeed(run);
    let own = '';
    b.gateway.complete = async (req) => {
      b.gateway.requests.push(req);
      own = /Seed: (\S+)\. /.exec(JSON.stringify(req.messages))?.[1] ?? '';
      const text = `Colour: from ${own} and ${SIBLING}.\nLayout: one tall column.\n\n\`\`\`markdown\n# Spark\n\nA quiet direction.\n\`\`\``;
      return { text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0, ledgerEntryId: 'l1' };
    };
    const out = await modelStep(b.deps, { run, call: callOf(run, 'spark'), step: spark, ports: {}, refs: [] });
    const note = await b.store.artifacts.getText(out.noteArtifactId!);
    expect(own).toHaveLength(48);
    expect(note).toBe('Colour: from (the random string) and (the random string).\nLayout: one tall column.\n');
  });
});

describe("every write is checked against the run's seeds, read from the store", () => {
  it("a builder whose answer holds another step's seed is asked again, and the work holds none", async () => {
    const run = await benchRun(b, 'prose');
    await siblingSeed(run);
    answers([`\`\`\`markdown\n# Memo\n\nThe code ${SIBLING} became a plan.\n\`\`\``, '```markdown\n# Memo\n\nA plan.\n```']);
    const build: StepSpec = { id: 'draft', role: 'build', actor: 'model', tier: 'mid', prompt: 'product.test.draft', consumes: ['intent'], produces: ['artifact'], writes: true };
    const out = await modelStep(b.deps, { run, call: callOf(run, 'draft'), step: build, ports: {}, refs: [] });
    expect(b.gateway.requests).toHaveLength(2);
    expect(JSON.stringify(b.gateway.requests[1]!.messages)).toMatch(/never write it into the work/);
    expect(await b.store.artifacts.getText(out.artifactId!)).toBe('# Memo\n\nA plan.\n');
  });

  it("the author's own draft that holds one is asked again, and nothing is stored", async () => {
    const run = await benchRun(b, 'prose');
    await siblingSeed(run);
    const draft: StepSpec = { id: 'draft', role: 'build', actor: 'human', consumes: [], produces: ['artifact'], writes: true };
    const err = await finishHumanStep(b.deps, { run, call: stepCall(run, 'draft'), step: draft, kind: 'write', resolution: { checkpointId: 'cp-draft', text: `# Mine\n\nThe code ${SIBLING}.` }, ports: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerRejected);
    expect((err as Error).message).toMatch(PR3);
    expect((await b.store.events(run.runId)).filter((e) => e.type === 'artifact')).toEqual([]);
  });

  it('a VOICE answer that writes one into the work is asked again: on prose, in a claim log, and on a page', async () => {
    const prose = await benchRun(b, 'prose');
    await siblingSeed(prose);
    const memo = await VoiceQuestion.open(b, prose, await putWork(b, 'prose', '# Memo\n\nWe launched on 3 May.\n'));
    const err = await memo.answer(memo.offered!.replace('3 May', `3 May (${SIBLING})`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnswerRejected);
    expect((err as Error).message).toMatch(PR3);

    const claims = await benchRun(b, 'prose');
    await siblingSeed(claims);
    const log = await VoiceQuestion.open(b, claims, await putWork(b, 'prose', '# Memo\n\nWe launched on 3 May.\n'), voiceStep({ variant: 'claim-log' }), 'claims');
    const logged = await log.answer(log.offered!.replace('3 May', `3 May (${SIBLING})`)).catch((e: unknown) => e);
    expect(logged).toBeInstanceOf(AnswerRejected);
    expect((logged as Error).message).toMatch(PR3);

    const page = await benchRun(b, 'web-page');
    await siblingSeed(page);
    const html = '<!doctype html><html><head><title>T</title></head><body><h1>Head</h1><p>Sub</p></body></html>\n';
    const q = await VoiceQuestion.open(b, page, await putWork(b, 'web-page', html));
    const placed = await q.answer(`T\nHead ${SIBLING}\nSub`).catch((e: unknown) => e);
    expect(placed).toBeInstanceOf(AnswerRejected);
    expect((placed as Error).message).toMatch(PR3);
    for (const run of [prose, claims, page]) expect((await b.store.events(run.runId)).filter((e) => e.type === 'artifact')).toEqual([]);
    expect(b.gateway.requests).toEqual([]);
  });

  /** A storyboard that holds the sibling's seed in a caption (C5's work, as the runner stores it). */
  const seeded = storyboard({ voiceover: 'Bread before seven.', storyboard: [{ shot: 1, caption: `Hot bread ${SIBLING}` }, { shot: 2, caption: 'Oven' }] });

  it("a relay link's storyboard holding one is not stored", async () => {
    const run = await benchRun(b, 'media');
    await siblingSeed(run);
    answers(['```json\n{"clipPrompt":"Shot 1: the loaf turns","durationSec":3}\n```']);
    b.gateway.video = async () => {
      const clip = await b.store.artifacts.putText('<svg/>', 'image/svg+xml');
      const frame = await b.store.artifacts.put(png(4, 3, [9, 9, 9]), 'image/png');
      return { artifactId: clip.id, mediaType: 'image/svg+xml', lastFrameArtifactId: frame.id, lastFrameMediaType: 'image/png', costUsd: 0, servedModel: 'mock', provider: 'mock', ledgerEntryId: 'v1' };
    };
    const relay: StepSpec = { id: 'clip', role: 'relay', block: 'RELAY', actor: 'model', prompt: 'product.test.clip', consumes: ['anchor', 'artifact'], produces: ['artifact', 'anchor'], writes: true };
    const start = (await b.store.artifacts.put(png(4, 3, [1, 2, 3]), 'image/png')).id;
    const link = relayLink(b.deps, { run, call: callOf(run, 'clip', 'D2'), step: relay, ports: { artifact: await putWork(b, 'media', seeded), anchor: start }, shot: 1, waits: DEFAULT_RELAY_WAITS });
    await expect(link).rejects.toThrow(/could not update the storyboard: The answer contains the random string/);
  });

  it("an asset step's attached images are not stored on a storyboard holding one", async () => {
    const run = await benchRun(b, 'media');
    await siblingSeed(run);
    const frames = toStepSpec(steps(CATALOG.find((r) => r.id === 'c5')!).find(({ step }) => step.id === 'anchor-frames')!.step);
    answers(['```json\n' + JSON.stringify({ images: [1, 2].map((shot) => ({ slot: String(shot), prompt: `Shot ${shot}`, alt: `Shot ${shot}`, size: '1536x1024' })) }) + '\n```']);
    let n = 0;
    b.gateway.image = async (): Promise<ImageResult> => {
      const { id } = await b.store.artifacts.put(png(4, 3, [++n * 20, 10, 10]), 'image/png');
      return { artifactId: id, mediaType: 'image/png', servedModel: 'mock-image', provider: 'mock', costUsd: 0.04, ledgerEntryId: `i${n}` };
    };
    const made = assetStep(b.deps, { run, call: callOf(run, 'anchor-frames', 'D2'), step: frames, ports: { artifact: await putWork(b, 'media', seeded) } });
    await expect(made).rejects.toThrow(/could not attach its images: The answer contains the random string/);
  });
});
