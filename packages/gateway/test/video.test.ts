import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { FAL_EXTRACT_FRAME } from '../src/providers/fal.ts';
import { fakeFal, fakeFetch, httpError, MemoryArtifacts } from './fakes.ts';

/** Shaped like a fal key (key id, a colon, the secret), and not a real one. */
const FAL_KEY = '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff';
const BALANCED_VIDEO = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
const BEST_VIDEO = 'fal-ai/kling-video/v3/pro/image-to-video';

let dir: string;
let artifacts: MemoryArtifacts;
let caps: { workspace: number; runs: Record<string, number> };
let startFrame: string;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'byway-video-'));
  artifacts = new MemoryArtifacts();
  caps = { workspace: 100, runs: {} };
  startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
});

const instant = async (_ms: number) => {};

function gateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts,
    caps: { workspaceCapUsd: () => caps.workspace, runCapUsd: (id) => caps.runs[id] },
    env: { FAL_KEY },
    retry: { sleep: instant, random: () => 0.5 },
    now: () => new Date('2026-10-07T12:00:00Z'),
    ...over,
  });
}

const req = (over: Partial<VideoRequest> = {}): VideoRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'clip',
  purpose: 'relay:media',
  profileId: 'balanced',
  prompt: 'Shot 2: the runner crests the ridge at dawn, slow push in',
  startFrameArtifactId: startFrame,
  durationSec: 5,
  ...over,
});

const ledgerLines = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('gateway: video through fal.ai', () => {
  it('uploads the start frame, generates the clip, stores the clip and its last frame, and ledgers seconds', async () => {
    const fal = fakeFal();
    const fetch = fakeFetch();
    const g = gateway({ clients: { fal: fal.client }, fetch: fetch.fetch });
    const res = await g.video(req());

    // The start frame went to fal storage as the stored PNG's bytes.
    expect(fal.uploads).toHaveLength(1);
    expect(fal.uploads[0]).toMatchObject({ type: 'image/png', bytes: (await artifacts.get(startFrame)).bytes.byteLength });
    // The profile's image-to-video model was called through the queue with that frame.
    expect(fal.calls[0]).toEqual({ endpoint: BALANCED_VIDEO, input: { prompt: req().prompt, image_url: fal.uploadedUrl(0), duration: '5' } });
    // fal's own last-frame endpoint ran on the clip.
    expect(fal.calls[1]).toEqual({ endpoint: FAL_EXTRACT_FRAME, input: { video_url: fal.clipUrl, frame_type: 'last' } });
    expect(fetch.requested).toEqual([fal.clipUrl, fal.frameUrl]);

    // Both are stored at once (provider URLs expire).
    expect((await artifacts.get(res.artifactId)).record.mediaType).toBe('video/mp4');
    expect(Buffer.from((await artifacts.get(res.artifactId)).bytes).toString()).toBe('mp4-bytes');
    const frame = await artifacts.get(res.lastFrameArtifactId);
    expect(frame.record.mediaType).toBe('image/png');
    expect(Buffer.from(frame.bytes.subarray(0, 4)).toString('hex')).toBe('89504e47');

    // 5 s at $0.07, plus fal's frame extraction bounded at 10 compute seconds at $0.0002.
    expect(res).toMatchObject({ provider: 'fal', servedModel: BALANCED_VIDEO, costUsd: 0.352 });
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ id: res.ledgerEntryId, kind: 'video', provider: 'fal', purpose: 'relay:media', requestedModel: BALANCED_VIDEO, usage: { inputTokens: 0, outputTokens: 0, units: 5 }, costUsd: 0.352, runId: 'run-1', stepId: 'clip' });
    expect(await g.verifyLedger()).toBeNull();
    expect((await g.spend('ws-1')).spentUsd).toBe(0.352);
  });

  it('snaps the duration to what the model can make, and bills what it makes', async () => {
    const fal = fakeFal();
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    await g.video(req({ durationSec: 8.5 }));
    expect(fal.calls[0]?.input).toMatchObject({ duration: '10' });
    expect(ledgerLines()[0]).toMatchObject({ usage: { units: 10 }, costUsd: 0.702 });
    await g.video(req({ durationSec: 2 }));
    expect(fal.calls[2]?.input).toMatchObject({ duration: '5' });
  });

  it("uses the best profile's model with its own input names, and no native audio (the voice-over is a separate step)", async () => {
    const fal = fakeFal();
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = await g.video(req({ profileId: 'best', durationSec: 4 }));
    expect(fal.calls[0]).toEqual({ endpoint: BEST_VIDEO, input: { prompt: req().prompt, start_image_url: fal.uploadedUrl(0), duration: '4', generate_audio: false } });
    // 4 s at $0.112 (audio off) + the frame extraction bound.
    expect(res.costUsd).toBe(0.45);
  });

  it('refuses before any call: no key, no video model, no start frame, a missing frame or a bad duration', async () => {
    const fal = fakeFal();
    const fetch = fakeFetch();
    const opts = { clients: { fal: fal.client }, fetch: fetch.fetch };
    await expect(gateway({ ...opts, env: {} }).video(req())).rejects.toMatchObject({ code: 'no-credentials', message: expect.stringMatching(/fal/) });
    await expect(gateway(opts).video(req({ profileId: 'openai' }))).rejects.toMatchObject({ code: 'no-credentials', message: expect.stringMatching(/no video model/) });
    await expect(gateway(opts).video(req({ profileId: 'nope' }))).rejects.toMatchObject({ code: 'unknown-profile' });
    const { startFrameArtifactId: _, ...noFrame } = req();
    await expect(gateway(opts).video(noFrame)).rejects.toMatchObject({ code: 'invalid-request', message: expect.stringMatching(/start frame/) });
    await expect(gateway(opts).video(req({ startFrameArtifactId: 'sha256:missing' }))).rejects.toMatchObject({ code: 'invalid-request' });
    for (const durationSec of [0, -1, Number.NaN, 120]) await expect(gateway(opts).video(req({ durationSec }))).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(gateway(opts).video(req({ prompt: ' ' }))).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(gateway(opts).video(req({ purpose: '' }))).rejects.toMatchObject({ code: 'invalid-request' });
    expect([fal.calls, fal.uploads, fetch.requested]).toEqual([[], [], []]);
  });

  it('refuses a clip the run budget cannot cover, with the shortfall, before calling fal', async () => {
    const fal = fakeFal();
    caps.runs['run-1'] = 0.3;
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.code).toBe('budget-exceeded');
    expect(err.budget).toMatchObject({ scope: 'run', capUsd: 0.3, estimateUsd: 0.352, shortfallUsd: 0.052 });
    expect(fal.calls).toEqual([]);
  });

  it('retries transient fal failures and ledgers the clip once', async () => {
    const fal = fakeFal({ [BALANCED_VIDEO]: [httpError(503), httpError(429)] });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    await g.video(req());
    expect(fal.calls.filter((c) => c.endpoint === BALANCED_VIDEO)).toHaveLength(3);
    expect(ledgerLines()).toHaveLength(1);
  });

  it('maps fal errors to gateway codes, keeps the key out of them and spends nothing on a failed generation', async () => {
    const cases: [Error, string][] = [
      [httpError(401, `bad key ${FAL_KEY}`), 'no-credentials'],
      [httpError(422, 'prompt: field required'), 'invalid-request'],
      [httpError(403, 'content policy'), 'provider-error'],
    ];
    for (const [error, code] of cases) {
      const fal = fakeFal({ [BALANCED_VIDEO]: [error] });
      const err = (await gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
      expect(err.code, error.message).toBe(code);
      expect(err.message).not.toContain(FAL_KEY);
    }
    expect(() => ledgerLines()).toThrow();
  });

  it('keeps and ledgers a paid clip when the last frame cannot be made, then fails the call', async () => {
    const fal = fakeFal({ [FAL_EXTRACT_FRAME]: [httpError(400, 'unsupported codec'), httpError(400, 'unsupported codec')] });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.code).toBe('invalid-request');
    expect(err.message).toMatch(/last frame/);
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ kind: 'video', costUsd: 0.352, usage: { units: 5 } });
    // The clip itself is in the store, so the spend is not lost.
    const stored = [...artifacts.items.values()].filter((i) => i.record.mediaType === 'video/mp4');
    expect(stored).toHaveLength(1);
  });

  it('refuses a download that is not https, or that the provider fails to serve', async () => {
    const plain = fakeFal({}, { clipUrl: 'http://v3.fal.media/files/clip.mp4' });
    await expect(gateway({ clients: { fal: plain.client }, fetch: fakeFetch().fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/https/) });
    const gone = fakeFal();
    const fetch = fakeFetch({ [gone.clipUrl]: 404 });
    await expect(gateway({ clients: { fal: gone.client }, fetch: fetch.fetch }).video(req())).rejects.toMatchObject({ code: 'invalid-request' });
    // Both clips were generated (billed), so both are ledgered even though neither could be kept.
    expect(ledgerLines().map((e) => e.costUsd)).toEqual([0.352, 0.352]);
  });
});

describe('gateway: video in demo mode', () => {
  it('stores a labelled placeholder clip and a PNG last frame, at $0, with no fal call', async () => {
    const fal = fakeFal();
    const g = gateway({ demo: true, clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = await g.video(req({ profileId: 'best' }));
    expect(fal.calls).toEqual([]);
    const clip = await artifacts.get(res.artifactId);
    expect(clip.record.mediaType).toBe('image/svg+xml');
    const svg = Buffer.from(clip.bytes).toString('utf8');
    expect(svg).toContain('Sample clip — shot 2');
    expect(svg).toMatch(/<animate/);
    expect(svg).not.toMatch(/<script|href=|\son[a-z]+=/i);
    const frame = await artifacts.get(res.lastFrameArtifactId);
    expect(frame.record.mediaType).toBe('image/png');
    expect(res).toMatchObject({ provider: 'mock', servedModel: 'mock-video', costUsd: 0 });
    expect(ledgerLines()[0]).toMatchObject({ kind: 'video', provider: 'mock', costUsd: 0, usage: { units: 5 } });
  });

  it('works in the demo profile without demo mode, numbers shots from the prompt or in call order, and is deterministic', async () => {
    const g = gateway({ env: {} });
    const a = await g.video(req({ profileId: 'demo', prompt: 'A slow pan across the trail' }));
    const b = await g.video(req({ profileId: 'demo', prompt: 'The runner laces up' }));
    const text = async (id: string) => Buffer.from((await artifacts.get(id)).bytes).toString('utf8');
    expect(await text(a.artifactId)).toContain('Sample clip — shot 1');
    expect(await text(b.artifactId)).toContain('Sample clip — shot 2');
    const again = await gateway({ env: {} }).video(req({ profileId: 'demo' }));
    const repeat = await gateway({ env: {} }).video(req({ profileId: 'demo' }));
    expect([again.artifactId, again.lastFrameArtifactId]).toEqual([repeat.artifactId, repeat.lastFrameArtifactId]);
    // The demo needs no start frame.
    const { startFrameArtifactId: _, ...noFrame } = req({ profileId: 'demo' });
    await expect(g.video(noFrame)).resolves.toMatchObject({ provider: 'mock' });
  });
});
