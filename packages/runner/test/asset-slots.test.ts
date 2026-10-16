/**
 * The ASSET brief contract (F11, F12; ADR-0090), on the canonical steps and the real prompt library:
 * - how many images a step may ask for is declared by the prompt it uses (`images:` front matter), not by its medium;
 * - one slot identity (shot numbers, option labels, trimmed names) decides coverage, purchases, attaching and the anchor;
 * - coverage is checked before anything is bought, and a short answer gets one feedback retry, then degrades with a note
 *   naming what is missing, never a failed run; only a malformed answer still fails the step;
 * - the relay anchor is shot 1's frame or none, and a relay link with no frame to start from is skipped plainly;
 * - C3's header image: the person's Yes decides, and the AI's view is one line of advice in the step's note (ADR-0101).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/common';
import { CATALOG, presentationOf, stepPresentation } from '@byway/catalog';
import { GatewayError, type CompletionRequest, type CompletionResult, type Gateway, type ImageRequest, type ImageResult, type Medium, type VideoRequest } from '@byway/contracts';
import { PROFILES } from '@byway/gateway';
import { createPromptRenderer } from '@byway/prompts';
import { steps } from '@byway/recipe';
import { adviceNote, assetStep, NO_BRIEF_NOTE, NO_IMAGE_CHOSEN_NOTE } from '../src/activities/asset.ts';
import type { RunnerDeps } from '../src/activities/deps.ts';
import { ContractMissed, StepError, toFailure } from '../src/activities/failures.ts';
import { noStartFrameNote, relayLink } from '../src/activities/relay.ts';
import { checkBriefs, eachPlan, freePlan, slotId } from '../src/activities/slot-plan.ts';
import { serializeJson } from '../src/formats.ts';
import { ADVICE_MAX } from '../src/parse.ts';
import { FAILURE, toStepSpec, type AssetResult, type RunRef, type StepSpec } from '../src/types.ts';
import { png } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore, type MemoStore } from './helpers/memo.ts';

const library = createPromptRenderer();
let dir: string;
let store: MemoStore;
let workspaceId: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'byway-slots-'));
  store = createTestStore({ dataDir: dir });
  workspaceId = (await store.ensureDefaultWorkspace()).id;
});
afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

/** A canonical step, as the runner gets it. */
const spec = (recipeId: string, stepId: string): StepSpec => {
  const recipe = CATALOG.find((r) => r.id === recipeId)!;
  return toStepSpec(steps(recipe).find(({ step }) => step.id === stepId)!.step);
};

interface Fake extends Gateway {
  completions: CompletionRequest[];
  images: ImageRequest[];
  videos: VideoRequest[];
}

/**
 * A demo-mode gateway: brief answers from a script, integrate answers that place every image they are given, and images
 * stored as small PNGs unless `refuse` says otherwise for that request (true: a plain refusal; an Error: that failure).
 */
function fake(briefs: string[], refuse: (req: ImageRequest) => boolean | Error = () => false): Fake {
  const completions: CompletionRequest[] = [];
  const images: ImageRequest[] = [];
  const videos: VideoRequest[] = [];
  const answer = (req: CompletionRequest, text: string): CompletionResult => ({ text, stopReason: 'end', servedModel: 'scripted', provider: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01, ledgerEntryId: `l${completions.length}` });
  const demo = PROFILES.find((p) => p.id === 'demo')!;
  return {
    demo: true,
    completions,
    images,
    videos,
    async complete(req) {
      completions.push(req);
      if (req.purpose.startsWith('asset.integrate')) {
        const text = JSON.stringify(req.messages);
        const ids = [...new Set(text.match(/\/api\/artifacts\/sha256:[0-9a-f]{64}/g) ?? [])];
        if (req.purpose === 'asset.integrate:web-page') return answer(req, '```html\n<!doctype html><html><body>' + ids.map((id) => `<img src="${id}" alt="">`).join('') + '</body></html>\n```');
        return answer(req, `\`\`\`markdown\n# Piece\n\n${ids.map((id, i) => `![Image ${i + 1}](${id})`).join('\n\n')}\n\nThe text.\n\`\`\``);
      }
      if (req.purpose === 'relay:media') return answer(req, '```json\n{"clipPrompt":"Shot 1: the cup turns","durationSec":3}\n```');
      return answer(req, briefs.shift() ?? '');
    },
    async image(req): Promise<ImageResult> {
      images.push(req);
      const refusal = refuse(req);
      if (refusal instanceof Error) throw refusal;
      if (refusal) throw new GatewayError('refused', 'mock refused this image');
      const { id } = await store.artifacts.put(png(4, 3, [images.length * 20, 10, 10]), 'image/png');
      return { artifactId: id, mediaType: 'image/png', servedModel: 'mock-image', provider: 'mock', costUsd: 0.04, ledgerEntryId: `i${images.length}` };
    },
    async video(req) {
      videos.push(req);
      throw new Error('no video in these tests');
    },
    spend: async (id) => ({ workspaceId: id, spentUsd: 0, capUsd: 100, byRun: {} }),
    providers: () => [],
    profiles: () => [],
    profileStatus: () => [{ profile: demo, usable: true, missing: [], images: true, video: true, otherFamily: false }],
    verifyLedger: async () => null,
    spendRecords: async () => ({ inFlight: [], uncertain: [], faults: [], notInAuditFile: 0, setAside: [] }),
    auditLedger: async () => ({ brokenAt: null, missing: [], pending: 0, setAside: [], openFaults: 0 }),
    close: async () => undefined,
  };
}

const briefsOf = (...slots: (string | number)[]) =>
  '```json\n' + JSON.stringify({ images: slots.map((slot) => ({ slot, prompt: `An image for ${String(slot).trim()}`, alt: `Alt ${String(slot).trim()}`, size: '1536x1024' })) }) + '\n```';
const EMPTY = '```json\n{"images":[]}\n```';

async function newRun(medium: Medium): Promise<RunRef> {
  const run = await store.createRun({ id: `run-${Math.random().toString(36).slice(2)}`, workspaceId, recipeId: 'c5', recipeHash: 'sha256:x', profileId: 'demo', title: 't', problem: 'p', medium, budgetUsd: 5 });
  await store.updateRun(run.id, { status: 'running' });
  return { runId: run.id, workspaceId, recipeId: 'c5', profileId: 'demo', medium, problem: { text: 'An ad for a cup' }, seeds: [] };
}

const storyboard = (shots = [1, 2, 3]) =>
  serializeJson({ storyboard: shots.map((shot) => ({ shot, description: `Shot ${shot} shows the cup`, imagePrompt: `The cup, angle ${shot}`, durationSec: 3 })), voiceover: 'Less waste.' });
const optionsDoc = () => serializeJson({ options: ['One', 'Two', 'Three'].map((title) => ({ title, pitch: `${title} pitch`, rationale: 'Because.' })) });

async function runAsset(medium: Medium, step: StepSpec, artifactText: string, gateway: Fake): Promise<{ result: AssetResult | unknown; notes: unknown[]; skipped: unknown[]; run: RunRef }> {
  const run = await newRun(medium);
  const artifact = (await store.artifacts.putText(artifactText, medium === 'prose' ? 'text/markdown' : 'application/json')).id;
  const deps: RunnerDeps = { gateway, store, prompts: library };
  const result = await assetStep(deps, { run, call: { key: `${run.runId}/${step.id}/-/1`, stepId: step.id, stage: 'D2' }, step, ports: { artifact } }).catch((e: unknown) => e);
  const finished = (await store.events(run.runId)).filter((e) => e.type === 'step-finished');
  return { result, notes: finished.map((e) => e.data.note), skipped: finished.map((e) => e.data.skipped), run };
}

const json = async (id: string) => JSON.parse(await store.artifacts.getText(id)) as { storyboard?: { shot: number; imageArtifactId?: string }[]; options?: { imageArtifactId?: string }[] };

describe('one slot identity on media (C5 anchor frames)', () => {
  const frames = () => spec('c5', 'anchor-frames');

  it('a shot number with spaces around it attaches to its shot', async () => {
    const g = fake([briefsOf(' 1 ', '2', '3')]);
    const { result } = await runAsset('media', frames(), storyboard(), g);
    const sb = await json((result as AssetResult).artifactId!);
    expect(sb.storyboard!.map((s) => typeof s.imageArtifactId)).toEqual(['string', 'string', 'string']);
    expect(g.images).toHaveLength(3);
  });

  it('two spellings of one shot buy one image, and "Shot 1" is shot 1', async () => {
    const g = fake([briefsOf('1', ' 1', '2', '3')]);
    await runAsset('media', frames(), storyboard(), g);
    expect(g.images).toHaveLength(3);
    const h = fake([briefsOf('Shot 1', '2', '3')]);
    const { result } = await runAsset('media', frames(), storyboard(), h);
    expect((await json((result as AssetResult).artifactId!)).storyboard![0]!.imageArtifactId).toBeDefined();
  });

  it('a brief list missing shot 1 is asked again before anything is bought; still missing, the rest is bought, the note names shot 1, and there is no anchor', async () => {
    const g = fake([briefsOf('2', '3'), briefsOf('2', '3')]);
    const { result, notes, skipped } = await runAsset('media', frames(), storyboard(), g);
    const briefCalls = g.completions.filter((c) => c.purpose === 'asset.briefs:media');
    expect(briefCalls).toHaveLength(2);
    expect(JSON.stringify(briefCalls[1]!.messages)).toMatch(/shot 1/);
    expect(g.images).toHaveLength(2);
    expect((result as AssetResult).anchor).toBeUndefined();
    expect(skipped).toEqual([undefined]);
    expect(notes[0]).toMatch(/shot 1/);
    expect(notes[0]).toMatch(/No frame was made for shot 1, so the video chain has no start frame\./);
  });

  it('when shot 1’s image is refused on both tries, there is no anchor and the note names shot 1', async () => {
    const g = fake([briefsOf('1', '2', '3')], (req) => req.prompt.endsWith('for 1'));
    const { result, notes } = await runAsset('media', frames(), storyboard(), g);
    expect(g.images.filter((r) => r.prompt.endsWith('for 1'))).toHaveLength(2);
    expect((result as AssetResult).anchor).toBeUndefined();
    expect(notes[0]).toMatch(/the image for shot 1 could not be made/);
    expect(notes[0]).toMatch(/No frame was made for shot 1/);
  });

  it('out of order, the anchor is still shot 1’s frame', async () => {
    const g = fake([briefsOf('3', '1', '2')]);
    const { result } = await runAsset('media', frames(), storyboard(), g);
    const sb = await json((result as AssetResult).artifactId!);
    expect((result as AssetResult).anchor).toBe(sb.storyboard!.find((s) => s.shot === 1)!.imageArtifactId);
  });

  it('a storyboard that cannot be read fails the step before any call', async () => {
    const g = fake([briefsOf('1')]);
    const { result } = await runAsset('media', frames(), '{"not":"a storyboard"}', g);
    expect(result).toBeInstanceOf(StepError);
    expect(g.completions).toHaveLength(0);
    expect(g.images).toHaveLength(0);
  });

  it('a malformed answer, twice, still fails the step', async () => {
    const g = fake(['no json here', 'still none']);
    const { result } = await runAsset('media', frames(), storyboard(), g);
    expect(result).toBeInstanceOf(ContractMissed);
    expect(g.images).toHaveLength(0);
  });
});

describe('a brief answer that covers every slot and names some the work does not have (round 2)', () => {
  it('on media: no retry, every shot bought and attached, and the note names only what was left out', async () => {
    const g = fake([briefsOf('1', '2', '3', '4')]);
    const { result, notes, skipped } = await runAsset('media', spec('c5', 'anchor-frames'), storyboard(), g);
    expect(g.completions.filter((c) => c.purpose === 'asset.briefs:media')).toHaveLength(1);
    expect(g.images).toHaveLength(3);
    const sb = await json((result as AssetResult).artifactId!);
    expect(sb.storyboard!.every((s) => typeof s.imageArtifactId === 'string')).toBe(true);
    expect((result as AssetResult).anchor).toBe(sb.storyboard![0]!.imageArtifactId);
    expect(skipped).toEqual([undefined]);
    expect(notes).toEqual(['The brief for “4”, which the storyboard has no shot for, was left out.']);
  });

  it('on options: no retry, and several left out are named together', async () => {
    const g = fake([briefsOf('A', 'B', 'C', 'Z', 'Option Y')]);
    const { notes } = await runAsset('options', spec('c2', 'mood-boards'), optionsDoc(), g);
    expect(g.completions.filter((c) => c.purpose === 'asset.briefs:options')).toHaveLength(1);
    expect(g.images).toHaveLength(3);
    expect(notes).toEqual(['Briefs for “Z” and “Option Y”, which are not among the options, were left out.']);
  });

  it('“Not every image was made” only when an image is missing: a missing shot and a left-out one are said apart', async () => {
    const g = fake([briefsOf('1', '2', '4'), briefsOf('1', '2', '4')]);
    const { notes } = await runAsset('media', spec('c5', 'anchor-frames'), storyboard(), g);
    expect(g.images).toHaveLength(2);
    expect(notes).toEqual(['Not every image was made: no image brief was written for shot 3. Briefs for “4”, which the storyboard has no shot for, were left out.']);
  });
});

describe('a short answer keeps every usable brief across the two tries (round 2)', () => {
  const frames = () => spec('c5', 'anchor-frames');

  it('short, then empty: the first answer’s briefs are bought, and the note says exactly what is missing', async () => {
    const g = fake([briefsOf('2', '3'), EMPTY]);
    const { result, notes, skipped } = await runAsset('media', frames(), storyboard(), g);
    expect(g.completions).toHaveLength(2);
    expect(g.images.map((r) => r.prompt)).toEqual(['An image for 2', 'An image for 3']);
    expect(skipped).toEqual([undefined]);
    expect((result as AssetResult).anchor).toBeUndefined();
    expect(notes).toEqual(['Not every image was made: no image brief was written for shot 1. No frame was made for shot 1, so the video chain has no start frame.']);
  });

  it('short, then only what was missing: together they cover every shot, so all are bought and nothing is said missing', async () => {
    const g = fake([briefsOf('2', '3'), briefsOf('1')]);
    const { result, notes } = await runAsset('media', frames(), storyboard(), g);
    expect(g.images.map((r) => r.prompt).sort()).toEqual(['An image for 1', 'An image for 2', 'An image for 3']);
    const sb = await json((result as AssetResult).artifactId!);
    expect((result as AssetResult).anchor).toBe(sb.storyboard![0]!.imageArtifactId);
    expect(notes).toEqual([undefined]);
  });

  it('short, then malformed: the first answer’s briefs are kept', async () => {
    const g = fake([briefsOf('1', '2'), 'no json here']);
    const { notes } = await runAsset('media', frames(), storyboard(), g);
    expect(g.images).toHaveLength(2);
    expect(notes).toEqual(['Not every image was made: no image brief was written for shot 3.']);
  });

  it('a slot both answers name is made from the later brief', async () => {
    const later = '```json\n' + JSON.stringify({ images: [{ slot: '1', prompt: 'Shot 1, as asked again', alt: 'a', size: '1536x1024' }] }) + '\n```';
    const g = fake([briefsOf('1', '2'), later]);
    await runAsset('media', frames(), storyboard(), g);
    expect(g.images.map((r) => r.prompt).sort()).toEqual(['An image for 2', 'Shot 1, as asked again']);
  });
});

describe('an image billed but not kept stops the run and says what that leaves (ADR-0099, ADR-0090 round 2)', () => {
  const lost = () => new GatewayError('byway-failure', 'mock made the image and billed it, but it could not be stored: ENOSPC. It is not retried, because a retry would pay again.', false, { billed: true });

  it('on media: not bought again; the failure says the run stops, what was billed, and that the images already made are not in the work', async () => {
    const g = fake([briefsOf('1', '2', '3')], (req) => (req.prompt.endsWith('for 2') ? lost() : false));
    const { result, run } = await runAsset('media', spec('c5', 'anchor-frames'), storyboard(), g);
    expect(g.images.map((r) => r.prompt)).toEqual(['An image for 1', 'An image for 2']);
    expect(result).toBeInstanceOf(GatewayError);
    expect(result).toMatchObject({ code: 'byway-failure', billed: true, retryable: false });
    const message = (result as GatewayError).message;
    expect(message).toBe(
      'mock made the image and billed it, but it could not be stored: ENOSPC. It is not retried, because a retry would pay again. ' +
        'That was the image for shot 2, so the run stops here, at the Custom imagery step, and buys no more images. ' +
        'The image already made for shot 1 was billed too, and it is not in the work.',
    );
    // The run's failure is this message, not retried (FAILURE.step): every GatewayError fails the step for good.
    const failure = toFailure(result) as ApplicationFailure;
    expect(failure).toMatchObject({ type: FAILURE.step, message, nonRetryable: true });
    expect((await store.events(run.runId)).filter((e) => e.type === 'step-finished')).toEqual([]);
  });

  it('several already made are named; with none made, nothing is said of them', async () => {
    const g = fake([briefsOf('1', '2', '3')], (req) => (req.prompt.endsWith('for 3') ? lost() : false));
    const { result } = await runAsset('media', spec('c5', 'anchor-frames'), storyboard(), g);
    expect((result as GatewayError).message).toMatch(/That was the image for shot 3, so the run stops here, at the Custom imagery step, and buys no more images. The 2 images already made for shot 1 and shot 2 were billed too, and they are not in the work\.$/);
    const h = fake([briefsOf('1', '2', '3')], () => lost());
    const first = await runAsset('media', spec('c5', 'anchor-frames'), storyboard(), h);
    expect(h.images).toHaveLength(1);
    expect((first.result as GatewayError).message).toMatch(/That was the image for shot 1, so the run stops here, at the Custom imagery step, and buys no more images.$/);
  });
});

describe('one slot identity on options (C2 mood boards)', () => {
  const moods = () => spec('c2', 'mood-boards');

  it('labels in either case buy one image each', async () => {
    const g = fake([briefsOf('a', 'A', 'B', 'C')]);
    await runAsset('options', moods(), optionsDoc(), g);
    expect(g.images).toHaveLength(3);
  });

  it('a label that is not an option and a missing one: asked again, then the rest is bought and the note names both', async () => {
    const g = fake([briefsOf('A', 'B', 'Z'), briefsOf('A', 'B', 'Z')]);
    const { notes } = await runAsset('options', moods(), optionsDoc(), g);
    expect(g.completions.filter((c) => c.purpose === 'asset.briefs:options')).toHaveLength(2);
    expect(g.images).toHaveLength(2);
    expect(notes[0]).toMatch(/option C/);
    expect(notes[0]).toMatch(/“Z”/);
  });
});

describe('how many images a prose step may make is the prompt’s to say', () => {
  it('C3: your Yes decides. An empty answer is asked again, and the second answer’s image is made and placed (D3, ADR-0101)', async () => {
    const g = fake([EMPTY, briefsOf('header')]);
    const { result, notes, skipped } = await runAsset('prose', spec('c3', 'asset'), '# Piece\n\nText.\n', g);
    const briefCalls = g.completions.filter((c) => c.purpose === 'asset.briefs:prose');
    expect(briefCalls).toHaveLength(2);
    expect(JSON.stringify(briefCalls[1]!.messages)).toContain('Write at least one image brief.');
    expect(g.images).toHaveLength(1);
    expect((result as AssetResult).artifactId).toBeDefined();
    expect(skipped).toEqual([undefined]);
    expect(notes).toEqual([undefined]);
  });

  it('C3 answered empty twice: nothing is bought, the step is skipped with its note, and the run goes on (no ContractMissed)', async () => {
    const g = fake([EMPTY, EMPTY]);
    const { result, notes, skipped } = await runAsset('prose', spec('c3', 'asset'), '# Piece\n\nText.\n', g);
    expect(g.completions).toHaveLength(2);
    expect(g.images).toHaveLength(0);
    expect(result).toMatchObject({ skipped: true, costUsd: 0.02 });
    expect((result as AssetResult).artifactId).toBeUndefined();
    expect(skipped).toEqual([true]);
    expect(notes).toEqual([NO_BRIEF_NOTE]);
  });

  it('C3’s explainer says Yes makes the image, and that the AI may add advice you can act on at Trim (D3, ADR-0101)', () => {
    const step = spec('c3', 'asset');
    expect(library.info(step.prompt!, 'prose').images).toEqual({ min: 1, max: 1 });
    expect(stepPresentation('c3', 'asset')?.explainer).toBe(
      'If you answer Yes, the AI makes a header image for the piece. It may also add one line of advice, which you can act on at Trim. Charts computed from your data are not made in this version.',
    );
  });

  it('the harness’s fake prompts carry the count each real image-briefs template declares, so e2e ASSET steps are held to it (round 2)', () => {
    const fake = fakePrompts();
    const checked: string[] = [];
    for (const id of library.ids()) {
      for (const medium of [undefined, ...library.variants(id)]) {
        let info;
        try {
          info = library.info(id, medium);
        } catch {
          continue;
        }
        if (info.output !== 'image-briefs') continue;
        expect(fake.render(id, medium ? { medium } : {}).images, `${id}@${medium ?? 'base'}`).toEqual(info.images);
        checked.push(`${id}@${medium ?? 'base'}`);
      }
    }
    expect(checked).toEqual(expect.arrayContaining(['product.c3.asset@base', 'article.ASSET@base', 'helper.asset.briefs@prose', 'helper.asset.briefs@media']));
    expect(fake.render('product.c4.draft', { medium: 'prose' }).images).toBeUndefined();
  });

  it('the harness’s fake prompts ask for advice exactly where the real templates do (ADR-0101)', () => {
    const fake = fakePrompts();
    for (const id of library.ids()) {
      for (const medium of [undefined, ...library.variants(id)]) {
        let info;
        try {
          info = library.info(id, medium);
        } catch {
          continue;
        }
        expect(fake.render(id, medium ? { medium } : {}).advice, `${id}@${medium ?? 'base'}`).toBe(info.advice ? true : undefined);
      }
    }
    expect(fake.render('product.c3.asset', { medium: 'prose' }).advice).toBe(true);
  });

  it('C3 asks for one image at most', async () => {
    const g = fake([briefsOf('header', 'second')]);
    const { result } = await runAsset('prose', spec('c3', 'asset'), '# Piece\n\nText.\n', g);
    expect(g.images).toHaveLength(1);
    expect((result as AssetResult).artifactId).toBeDefined();
  });

  it('the generic prose helper may answer with no image too', async () => {
    const g = fake([EMPTY]);
    const helperStep: StepSpec = { ...spec('c3', 'asset'), prompt: 'product.none.asset', knobs: {} };
    const { notes } = await runAsset('prose', helperStep, '# Piece\n\nText.\n', g);
    expect(g.completions.map((c) => c.prompt?.id)).toEqual(['helper.asset.briefs']);
    expect(notes).toEqual([NO_IMAGE_CHOSEN_NOTE]);
  });

  it('C1’s ASSET asks for at least one: an empty answer is asked again as before, and the second answer is used', async () => {
    const g = fake([EMPTY, briefsOf('hero')]);
    const step = spec('c1', 'asset');
    const run = await newRun('web-page');
    const page = (await store.artifacts.putText('<!doctype html><html><body><div data-slot="hero"></div></body></html>\n', 'text/html')).id;
    const out = await assetStep({ gateway: g, store, prompts: library }, { run, call: { key: `${run.runId}/asset/-/1`, stepId: 'asset', stage: 'D2' }, step, ports: { artifact: page } });
    const briefCalls = g.completions.filter((c) => c.purpose === 'asset.briefs:web-page');
    expect(briefCalls).toHaveLength(2);
    expect(JSON.stringify(briefCalls[1]!.messages)).toContain('Write at least one image brief.');
    expect(g.images).toHaveLength(1);
    expect(out.artifactId).toBeDefined();
  });

  it('C1’s ASSET answered empty twice: nothing is bought, the work passes through, and the run goes on (no ContractMissed)', async () => {
    const g = fake([EMPTY, EMPTY]);
    const step = { ...spec('c1', 'asset') };
    const run = await newRun('web-page');
    const page = (await store.artifacts.putText('<!doctype html><html><body></body></html>\n', 'text/html')).id;
    const out = await assetStep({ gateway: g, store, prompts: library }, { run, call: { key: `${run.runId}/asset/-/1`, stepId: 'asset', stage: 'D2' }, step, ports: { artifact: page } });
    expect(g.completions).toHaveLength(2);
    expect(g.images).toHaveLength(0);
    expect(out).toMatchObject({ skipped: true });
    const finished = (await store.events(run.runId)).filter((e) => e.type === 'step-finished');
    expect(finished.map((e) => e.data)).toEqual([expect.objectContaining({ skipped: true, note: NO_BRIEF_NOTE })]);
  });
});

describe('the AI’s advice, never a veto (D3, ADR-0101)', () => {
  const PIECE = '# Piece\n\nText.\n';
  const answer = (images: string[], advice?: unknown) =>
    '```json\n' + JSON.stringify({ images: images.map((slot) => ({ slot, prompt: `An image for ${slot}`, alt: `Alt ${slot}`, size: '1536x1024' })), ...(advice === undefined ? {} : { advice }) }) + '\n```';

  it('C3’s brief may carry one line of advice: the image is still made and placed, and the note gives the advice as the AI’s, with what you can do', async () => {
    const g = fake([answer(['header'], 'This piece may read better without a header.')]);
    const { result, notes, skipped } = await runAsset('prose', spec('c3', 'asset'), PIECE, g);
    expect(g.completions.filter((c) => c.purpose === 'asset.briefs:prose')).toHaveLength(1);
    expect(g.images).toHaveLength(1);
    expect((result as AssetResult).artifactId).toBeDefined();
    expect(skipped).toEqual([undefined]);
    expect(notes).toEqual(['The AI suggests: This piece may read better without a header. You can cut the image at Trim.']);
  });

  it('the note ends the advice with a stop when it has none, and says nothing for empty advice', async () => {
    expect(adviceNote('A real photograph would serve it better')).toBe('The AI suggests: A real photograph would serve it better. You can cut the image at Trim.');
    expect(adviceNote('Is a header needed?')).toBe('The AI suggests: Is a header needed? You can cut the image at Trim.');
    expect(adviceNote('Its own line says it: “less is more.”')).toBe('The AI suggests: Its own line says it: “less is more.” You can cut the image at Trim.');
    expect(adviceNote('Keep it quiet (a photo would do)')).toBe('The AI suggests: Keep it quiet (a photo would do). You can cut the image at Trim.');
    const g = fake([answer(['header'], '  ')]);
    const { notes } = await runAsset('prose', spec('c3', 'asset'), PIECE, g);
    expect(g.images).toHaveLength(1);
    expect(notes).toEqual([undefined]);
  });

  it('advice that came with an empty first answer stays when the second answer brings the brief', async () => {
    const g = fake([answer([], 'Better without a header.'), answer(['header'])]);
    const { notes } = await runAsset('prose', spec('c3', 'asset'), PIECE, g);
    expect(g.completions).toHaveLength(3);
    expect(g.images).toHaveLength(1);
    expect(notes).toEqual([adviceNote('Better without a header.')]);
  });

  it('the later answer’s advice is the one shown when both give one', async () => {
    const g = fake([answer([], 'First thought.'), answer(['header'], 'Second thought.')]);
    const { notes } = await runAsset('prose', spec('c3', 'asset'), PIECE, g);
    expect(notes).toEqual([adviceNote('Second thought.')]);
  });

  it('empty twice, even with advice: skipped with the usual note, and nothing said about an image that was not made', async () => {
    const g = fake([answer([], 'Better without a header.'), answer([], 'Better without a header.')]);
    const { notes, skipped } = await runAsset('prose', spec('c3', 'asset'), PIECE, g);
    expect(g.images).toHaveLength(0);
    expect(skipped).toEqual([true]);
    expect(notes).toEqual([NO_BRIEF_NOTE]);
  });

  it('a step whose prompt does not ask for advice never shows any (C1’s ASSET)', async () => {
    const g = fake([answer(['hero'], 'This page may read better without a hero image.')]);
    const run = await newRun('web-page');
    const page = (await store.artifacts.putText('<!doctype html><html><body><div data-slot="hero"></div></body></html>\n', 'text/html')).id;
    await assetStep({ gateway: g, store, prompts: library }, { run, call: { key: `${run.runId}/asset/-/1`, stepId: 'asset', stage: 'D2' }, step: spec('c1', 'asset'), ports: { artifact: page } });
    expect(g.images).toHaveLength(1);
    const finished = (await store.events(run.runId)).filter((e) => e.type === 'step-finished');
    expect(finished.map((e) => e.data.note)).toEqual([undefined]);
  });

  it('C3’s prompt states the bound the runner holds the advice to', () => {
    expect(library.render('product.c3.asset', { medium: 'prose', artifact: PIECE }).user).toContain(`at most ${ADVICE_MAX} characters`);
  });

  it('every step whose prompt asks for advice has a Trim step after it, so “You can cut the image at Trim.” is true', () => {
    const asking: string[] = [];
    for (const recipe of CATALOG) {
      for (const { step } of steps(recipe)) {
        if (!step.prompt) continue;
        let advice = false;
        try {
          advice = library.info(step.prompt, recipe.medium).advice;
        } catch {
          continue;
        }
        if (!advice) continue;
        asking.push(`${recipe.id}/${step.id}`);
        const shown = presentationOf(recipe.id)!.stages.flatMap((s) => s.steps);
        const at = shown.findIndex((s) => s.stepIds.includes(step.id));
        expect(at, `${recipe.id}/${step.id} has a shown step`).toBeGreaterThanOrEqual(0);
        expect(shown.slice(at + 1).some((s) => s.label === 'Trim'), `${recipe.id}/${step.id} is followed by Trim`).toBe(true);
      }
    }
    expect(asking).toEqual(['c3/asset']);
  });
});

describe('a relay link with no frame to start from (F12)', () => {
  it('is skipped plainly before any model or video call, instead of starting a paid clip from another shot’s frame', async () => {
    const g = fake([]);
    const run = await newRun('media');
    const artifact = (await store.artifacts.putText(storyboard(), 'application/json')).id;
    const out = await relayLink({ gateway: g, store, prompts: library }, { run, call: { key: `${run.runId}/clip/-/1`, stepId: 'clip', stage: 'D2' }, step: spec('c5', 'clip'), ports: { artifact, shot: 1 }, shot: 1 });
    expect(out).toMatchObject({ skipped: true, costUsd: 0 });
    expect(g.completions).toHaveLength(0);
    expect(g.videos).toHaveLength(0);
    const finished = (await store.events(run.runId)).filter((e) => e.type === 'step-finished');
    expect(finished.map((e) => e.data.note)).toEqual([noStartFrameNote(1)]);
  });
});

describe('the slot plan on its own', () => {
  it('one identity per slot: a shot number however written, an option label in either case, a trimmed name', () => {
    const media = eachPlan('media', storyboard([1, 2, 10]), 'Frames')!;
    expect(media).toEqual({ kind: 'each', medium: 'media', expected: ['1', '2', '10'], first: '1' });
    expect([' 1 ', 'Shot 2', 'shot10', '01', '3', 'one'].map((s) => slotId(media, s))).toEqual(['1', '2', '10', '1', undefined, undefined]);
    const options = eachPlan('options', optionsDoc(), 'Mood boards')!;
    expect(['a', ' B ', 'Option c', 'D'].map((s) => slotId(options, s))).toEqual(['A', 'B', 'C', undefined]);
    expect(slotId(freePlan({ min: 1, max: 3 }, undefined), '  hero ')).toBe('hero');
  });

  it('a free plan takes the prompt’s range, capped by the step’s slots knob; a prompt that declares none asks for one to three', () => {
    expect(freePlan({ min: 0, max: 1 }, 1)).toEqual({ kind: 'free', min: 0, max: 1 });
    expect(freePlan({ min: 1, max: 3 }, 2)).toEqual({ kind: 'free', min: 1, max: 2 });
    expect(freePlan(undefined, undefined)).toEqual({ kind: 'free', min: 1, max: 3 });
  });

  it('a short answer is a miss that carries what it did give; a malformed one carries nothing', () => {
    const media = eachPlan('media', storyboard(), 'Frames')!;
    const brief = (slot: string) => ({ slot, prompt: 'p', alt: '', size: '1024x1024' as const });
    const short = checkBriefs({ ok: true, value: [brief('2'), brief('Z')] }, media);
    expect(short).toMatchObject({ ok: false, usable: { missing: ['1', '3'], unknown: ['Z'] } });
    expect(checkBriefs({ ok: false, problem: 'no json' }, media)).toEqual({ ok: false, problem: 'no json' });
  });
});
