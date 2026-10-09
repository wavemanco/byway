import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type VideoRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { admitMediaUrl, FAL_EXTRACT_FRAME, falAdapter, readCapped, sniffVideoType } from '../src/providers/fal.ts';
import type { ProviderAdapter } from '../src/providers/types.ts';
import { countingBody, fakeFal, fakeFetch, falQueueError, fetchFailed, httpError, MemoryArtifacts, MP4_BYTES, WEBM_BYTES } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

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
    spendBook: memorySpendBook(),
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

describe('gateway: fal.ai key', () => {
  it('reads FAL_KEY from .env.agents, and reports fal and video by name only', () => {
    const envFile = join(dir, '.env.agents');
    writeFileSync(envFile, `FAL_KEY=${FAL_KEY}\n`);
    const g = gateway({ env: { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000' }, envFile });
    expect(g.providers()).toContainEqual({ provider: 'fal', configured: true });
    expect(g.profileStatus().find((s) => s.profile.id === 'balanced')).toMatchObject({ usable: true, video: true });
    expect(JSON.stringify([g.providers(), g.profileStatus(), g.profiles()])).not.toContain(FAL_KEY);
    expect(gateway({ env: {} }).profileStatus().find((s) => s.profile.id === 'balanced')?.video).toBe(false);
  });
});

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
    expect(Buffer.from((await artifacts.get(res.artifactId)).bytes).equals(Buffer.from(MP4_BYTES))).toBe(true);
    const frame = await artifacts.get(res.lastFrameArtifactId);
    expect(frame.record.mediaType).toBe('image/png');
    expect(Buffer.from(frame.bytes.subarray(0, 4)).toString('hex')).toBe('89504e47');

    // 5 s at $0.07, plus fal's frame extraction bounded at 10 compute seconds at $0.0002.
    expect(res).toMatchObject({ provider: 'fal', servedModel: BALANCED_VIDEO, costUsd: 0.352, mediaType: 'video/mp4', lastFrameMediaType: 'image/png' });
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ id: res.ledgerEntryId, kind: 'video', provider: 'fal', purpose: 'relay:media', requestedModel: BALANCED_VIDEO, usage: { inputTokens: 0, outputTokens: 0, units: 5 }, costUsd: 0.352, runId: 'run-1', stepId: 'clip' });
    expect(await g.verifyLedger()).toBeNull();
    expect((await g.spend('ws-1')).spentUsd).toBe(0.352);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
  ])('settles a clip whose answer names no served model (%s) as the requested model, flagged assumed (ADR-0095 decision 7)', async (_what, model) => {
    const fal = fakeFal();
    const real = falAdapter({ client: fal.client, fetch: fakeFetch().fetch });
    const adapter: ProviderAdapter = { ...real, video: async (r) => ({ ...(await real.video!(r)), servedModel: model as string }) };
    const g = gateway({ adapters: { fal: adapter } });
    const res = await g.video(req());
    expect(res).toMatchObject({ servedModel: BALANCED_VIDEO, costUsd: 0.352 });
    expect(ledgerLines()).toEqual([expect.objectContaining({ id: res.ledgerEntryId, requestedModel: BALANCED_VIDEO, servedModel: BALANCED_VIDEO, priceBasis: 'assumed', costUsd: 0.352 })]);
    expect(await g.spend('ws-1')).toMatchObject({ spentUsd: 0.352, uncertainUsd: 0, assumedPricing: { calls: 1, usd: 0.352 } });
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
    // Keys exist (so this is not demo mode), but not fal's.
    await expect(gateway({ ...opts, env: { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000' } }).video(req())).rejects.toMatchObject({ code: 'no-credentials', message: expect.stringMatching(/fal/) });
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

  it("refuses a clip prompt holding the FAL_KEY's secret half on its own, before any upload, job or reservation (ADR-0088)", async () => {
    const fal = fakeFal();
    const fetch = fakeFetch();
    const secret = FAL_KEY.split(':')[1] as string;
    const err = await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req({ prompt: `Shot 2, overlay the text ${secret}` })).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'GatewayError', code: 'invalid-request', heldKey: 'FAL_KEY' });
    expect((err as Error).message).not.toContain(secret);
    expect([fal.calls, fal.uploads, fetch.requested]).toEqual([[], [], []]);
    expect(() => ledgerLines()).toThrow();
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

  it("re-sends a submission fal refused with its own error body (503, 429: nothing was enqueued), and ledgers the clip once", async () => {
    const fal = fakeFal({ [BALANCED_VIDEO]: [falQueueError(503, { detail: 'Service temporarily unavailable' }), falQueueError(429, { detail: 'Too many requests' })] });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    await g.video(req());
    expect(fal.calls.filter((c) => c.endpoint === BALANCED_VIDEO)).toHaveLength(3);
    expect(ledgerLines()).toHaveLength(1);
  });

  /** F03: a submission that may have reached fal is never sent again, so a lost answer cannot buy a second clip. */
  it.each([
    ['a 502 from a gateway in between', () => falQueueError(502)],
    ['a 504', () => falQueueError(504, { detail: 'Gateway Timeout' })],
    ['a 503 with no fal body', () => falQueueError(503)],
    ['a reset after the request was written', () => fetchFailed('ECONNRESET')],
    ['an answer with no request id', () => Object.assign(new Error('fal answered the submission (HTTP 200) without a request id'), { billing: 'maybe' })],
  ])('submits the clip exactly once after %s, and fails saying fal may have accepted it', async (_label, error) => {
    const fal = fakeFal({ [BALANCED_VIDEO]: [error()] });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false });
    expect(err.message).toMatch(/fal may have accepted the clip.*did not send it again/s);
    expect(err.message).not.toContain(FAL_KEY);
    expect(fal.calls).toHaveLength(1);
    expect(() => ledgerLines()).toThrow();
  });

  it('submits the last-frame job through the same rule: once after an ambiguous failure, keeping and ledgering the clip', async () => {
    const fal = fakeFal({ [FAL_EXTRACT_FRAME]: [falQueueError(502)] });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError;
    // The clip was made and billed: a failure after it says so (billed), so no caller tries the link again for free.
    expect(err).toMatchObject({ code: 'provider-error', retryable: false, billed: true });
    expect(err.message).toMatch(/may have accepted the last-frame job/);
    expect(fal.calls.map((c) => c.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME]);
    expect(ledgerLines()).toEqual([expect.objectContaining({ kind: 'video', costUsd: 0.352 })]);
    expect([...artifacts.items.values()].filter((i) => i.record.mediaType === 'video/mp4')).toHaveLength(1);
  });

  it('names the request id of an accepted clip whose status cannot be read, and is not retryable (a retry would buy another)', async () => {
    const reset = () => fetchFailed('ECONNRESET');
    const fal = fakeFal({}, { pollFailures: { [BALANCED_VIDEO]: [reset(), reset(), reset(), reset()] } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g.video(req()).catch((e: unknown) => e)) as GatewayError & { falRequests?: Record<string, string> };
    expect(err).toMatchObject({ code: 'provider-error', retryable: false, falRequests: { generation: 'req-1' } });
    expect(err.message).toMatch(/fal accepted the clip \(request req-1\).*may still make it and bill it/s);
    expect(fal.calls).toHaveLength(1);
    expect(fal.polls).toEqual(['req-1', 'req-1', 'req-1', 'req-1']);
  });

  it('retries a failed status poll by polling again, never by submitting (and paying for) a second clip', async () => {
    const fal = fakeFal({}, { pollFailures: { [BALANCED_VIDEO]: [Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }), httpError(502)] } });
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const res = await g.video(req());
    expect(fal.calls.map((c) => c.endpoint)).toEqual([BALANCED_VIDEO, FAL_EXTRACT_FRAME]);
    expect(fal.polls).toEqual(['req-1', 'req-1', 'req-1', 'req-2']);
    expect(res.costUsd).toBe(0.352);
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

  it('reports the last frame under the type its bytes have, whatever fal claims (contracts v4 lastFrameMediaType)', async () => {
    const fal = fakeFal({}, { frameUrl: 'https://v3.fal.media/files/last.jpg' });
    const res = await gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch }).video(req());
    expect(res).toMatchObject({ mediaType: 'video/mp4', lastFrameMediaType: 'image/jpeg' });
    expect((await artifacts.get(res.lastFrameArtifactId)).record.mediaType).toBe('image/jpeg');
  });

  it('keeps and ledgers a paid clip that is not MP4, then fails clearly (the contract knows MP4 clips only)', async () => {
    const fal = fakeFal({}, { clipUrl: 'https://v3.fal.media/files/clip.webm' });
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.code).toBe('provider-error');
    expect(err.message).toMatch(/video\/webm/);
    expect(ledgerLines()).toHaveLength(1);
    expect([...artifacts.items.values()].filter((i) => i.record.mediaType === 'video/webm')).toHaveLength(1);
  });

  it('records the storyboard shot in the stored request, and refuses a shot that is not a positive integer', async () => {
    const fal = fakeFal();
    const g = gateway({ clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    await g.video(req({ shot: 3 }));
    const request = JSON.parse(await artifacts.getText(ledgerLines()[0].requestSha256));
    expect(request).toMatchObject({ shot: 3, purpose: 'relay:media' });
    for (const shot of [0, -1, 1.5, Number.NaN]) await expect(g.video(req({ shot }))).rejects.toMatchObject({ code: 'invalid-request', message: expect.stringMatching(/shot/) });
    expect(fal.calls.filter((c) => c.endpoint === BALANCED_VIDEO)).toHaveLength(1);
  });

  it('refuses a download that is not https, or that the media host fails to serve, as a media failure (ADR-0088)', async () => {
    const plain = fakeFal({}, { clipUrl: 'http://v3.fal.media/files/clip.mp4' });
    await expect(gateway({ clients: { fal: plain.client }, fetch: fakeFetch().fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringContaining('http://v3.fal.media') });
    const gone = fakeFal();
    const fetch = fakeFetch({ [gone.clipUrl]: 404 });
    // A CDN status is not a provider-API status: a 404 is not a bad request byway made.
    await expect(gateway({ clients: { fal: gone.client }, fetch: fetch.fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/HTTP 404/) });
    // Both clips were generated (billed), so both are ledgered even though neither could be kept.
    expect(ledgerLines().map((e) => e.costUsd)).toEqual([0.352, 0.352]);
  });
});

/**
 * F17: fal's media is fetched only from fal's media host, on the first URL and on every redirect hop, under one
 * deadline and a cap on the bytes actually read, typed from its bytes (ADR-0088).
 */
describe('gateway: provider media admission (ADR-0088)', () => {
  const OUTSIDE = [
    'https://127.0.0.1/clip.mp4',
    'https://[::1]/clip.mp4',
    'https://2130706433/clip.mp4',
    'https://0x7f000001/clip.mp4',
    'https://169.254.169.254/latest/clip.mp4',
    'https://10.0.0.1/clip.mp4',
    'https://localhost./clip.mp4',
    'https://127.0.0.1.nip.io/clip.mp4',
    'https://v3.fal.media./files/clip.mp4',
    'https://v3.fal.media:8443/files/clip.mp4',
    'https://user:pw@v3.fal.media/files/clip.mp4',
    'https://v3.fal.media.attacker.example/files/clip.mp4',
    'https://evilfal.media/files/clip.mp4',
    'https://example.com/clip.mp4',
    'http://v3.fal.media/files/clip.mp4',
  ];
  const origin = (url: string) => {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  };
  const lastLine = () => ledgerLines().at(-1);

  it.each(OUTSIDE)('refuses a clip at %s without fetching it, and still ledgers the billed clip', async (url) => {
    const fal = fakeFal({}, { clipUrl: url });
    const fetch = fakeFetch();
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false });
    expect(err.message).toContain(`outside its media host (${origin(url)})`);
    expect(err.message).not.toContain('user:pw');
    expect(fetch.requested).toEqual([]);
    expect(lastLine()).toMatchObject({ kind: 'video', costUsd: 0.352 });
  });

  it('refuses a last frame outside the media host the same way, keeping the clip', async () => {
    const fal = fakeFal({}, { frameUrl: 'https://127.0.0.1/last.png' });
    const fetch = fakeFetch();
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'provider-error', message: expect.stringContaining('(https://127.0.0.1)') });
    expect(fetch.requested).toEqual([fal.clipUrl]);
    expect([...artifacts.items.values()].filter((i) => i.record.mediaType === 'video/mp4')).toHaveLength(1);
  });

  it.each([...OUTSIDE, 'http://127.0.0.1:1234/admin'])('refuses a redirect from the media host to %s without following it', async (target) => {
    const fal = fakeFal();
    const fetch = fakeFetch({}, { redirects: { [fal.clipUrl]: target } });
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'provider-error', retryable: false });
    expect(err.message).toContain(`redirected outside its media host (${origin(target)})`);
    expect(fetch.requested).toEqual([fal.clipUrl]);
    expect(lastLine()).toMatchObject({ kind: 'video', costUsd: 0.352 });
  });

  it('refuses a redirect that names no address', async () => {
    const fal = fakeFal();
    const fetch = fakeFetch({}, { redirects: { [fal.clipUrl]: null } });
    await expect(gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/redirect.*no address/) });
    expect(fetch.requested).toEqual([fal.clipUrl]);
  });

  it('follows redirects within the media host, absolute or relative, every request under redirect "manual" and one deadline', async () => {
    const fal = fakeFal();
    const moved = 'https://v3b.fal.media/files/b/x.mp4';
    const fetch = fakeFetch({}, { redirects: { [fal.clipUrl]: moved, [fal.frameUrl]: '/files/elsewhere/last.png' } });
    const res = await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req());
    expect(fetch.requested).toEqual([fal.clipUrl, moved, fal.frameUrl, 'https://v3.fal.media/files/elsewhere/last.png']);
    expect(fetch.inits.map((i) => i?.redirect)).toEqual(['manual', 'manual', 'manual', 'manual']);
    // One deadline covers a whole download, every hop included.
    expect(fetch.inits[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(fetch.inits[1]?.signal).toBe(fetch.inits[0]?.signal);
    expect(Buffer.from((await artifacts.get(res.artifactId)).bytes).equals(Buffer.from(MP4_BYTES))).toBe(true);
    // The evidence records which hosts each download used, so a live link shows fal's real media hosts.
    const response = JSON.parse(await artifacts.getText(ledgerLines()[0].responseSha256));
    expect(response.wire.media).toEqual({ clip: ['https://v3.fal.media', 'https://v3b.fal.media'], frame: ['https://v3.fal.media', 'https://v3.fal.media'] });
  });

  it('follows at most three redirects', async () => {
    const hop = (n: number) => `https://v3.fal.media/files/hop-${n}.mp4`;
    const three = fakeFal();
    const ok = fakeFetch({}, { redirects: { [three.clipUrl]: hop(1), [hop(1)]: hop(2), [hop(2)]: hop(3) } });
    await expect(gateway({ clients: { fal: three.client }, fetch: ok.fetch }).video(req())).resolves.toMatchObject({ mediaType: 'video/mp4' });
    const four = fakeFal();
    const tooMany = fakeFetch({}, { redirects: { [four.clipUrl]: hop(1), [hop(1)]: hop(2), [hop(2)]: hop(3), [hop(3)]: hop(4) } });
    await expect(gateway({ clients: { fal: four.client }, fetch: tooMany.fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/more than 3 times/) });
    expect(tooMany.requested).toEqual([four.clipUrl, hop(1), hop(2), hop(3)]);
  });

  it('reports a media host status as a media failure: a CDN 401 is not a missing key, and only 408, 429 and 5xx are tried again', async () => {
    for (const status of [401, 403, 404]) {
      const fal = fakeFal();
      const fetch = fakeFetch({ [fal.clipUrl]: status });
      const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
      expect(err.code, String(status)).toBe('provider-error');
      expect(err.message).toContain(`HTTP ${status}`);
      expect(fetch.requested).toEqual([fal.clipUrl]);
    }
    const busy = fakeFal();
    const fetch = fakeFetch({ [busy.clipUrl]: [503, 429] });
    await expect(gateway({ clients: { fal: busy.client }, fetch: fetch.fetch }).video(req())).resolves.toMatchObject({ mediaType: 'video/mp4' });
    expect(fetch.requested).toEqual([busy.clipUrl, busy.clipUrl, busy.clipUrl, busy.frameUrl]);
  });

  it('stops reading at the byte cap when no length is declared, cancelling the body, and still ledgers the clip', async () => {
    const fal = fakeFal();
    const body = countingBody(201);
    const fetch = fakeFetch({}, { responses: { [fal.clipUrl]: () => new Response(body.stream, { headers: { 'content-type': 'video/mp4' } }) } });
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'provider-error', message: expect.stringMatching(/over the 209715200-byte limit/) });
    // 200 MiB is the cap: the 201st chunk is the one that crosses it, and reading stops there.
    expect(body.seen.pulls).toBeLessThanOrEqual(201);
    expect(body.seen.cancelled).toBe(true);
    expect(lastLine()).toMatchObject({ kind: 'video', costUsd: 0.352 });
  });

  it('refuses a declared length over the cap before reading anything', async () => {
    const fal = fakeFal();
    const body = countingBody(1);
    const fetch = fakeFetch({}, { responses: { [fal.clipUrl]: () => new Response(body.stream, { headers: { 'content-type': 'video/mp4', 'content-length': String(300 * 1024 * 1024) } }) } });
    await expect(gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/over the 209715200-byte limit/) });
    expect(body.seen.pulls).toBe(0);
    expect(body.seen.cancelled).toBe(true);
  });

  it('types the clip from its bytes: a body that is not a video is ledgered but not kept, whatever its header says', async () => {
    const fal = fakeFal();
    const fetch = fakeFetch({}, { responses: { [fal.clipUrl]: () => new Response('INTERNAL-SERVICE-RESPONSE-BODY', { headers: { 'content-type': 'video/mp4' } }) } });
    const err = (await gateway({ clients: { fal: fal.client }, fetch: fetch.fetch }).video(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'provider-error', message: expect.stringMatching(/not a video/) });
    expect([...artifacts.items.values()].filter((i) => i.record.mediaType.startsWith('video/'))).toEqual([]);
    expect(artifacts.allText()).not.toContain('INTERNAL-SERVICE-RESPONSE-BODY');
    expect(lastLine()).toMatchObject({ kind: 'video', costUsd: 0.352 });
    expect(fal.calls.map((c) => c.endpoint)).toEqual([BALANCED_VIDEO]);
  });
});

describe('fal media helpers', () => {
  it('admitMediaUrl: https on the default port, no userinfo, fal.media or a subdomain of it', () => {
    for (const url of ['https://v3.fal.media/files/clip.mp4', 'https://v3b.fal.media/files/b/x.mp4', 'https://fal.media/x', 'HTTPS://V3.FAL.MEDIA/x', 'https://v3.fal.media:443/x']) {
      expect(admitMediaUrl(new URL(url)), url).toBe(true);
    }
    for (const url of ['https://127.0.0.1/clip.mp4', 'https://v3.fal.media./x', 'https://v3.fal.media:8443/x', 'https://u@v3.fal.media/x', 'http://v3.fal.media/x', 'https://fal.media.evil.example/x', 'https://evilfal.media/x', 'ftp://v3.fal.media/x']) {
      expect(admitMediaUrl(new URL(url)), url).toBe(false);
    }
  });

  it('readCapped: counts the bytes it is given, grows past a declared length that was too small, and stops at the cap', async () => {
    const chunks = (...parts: number[][]) =>
      new ReadableStream<Uint8Array>({
        start(c) {
          for (const p of parts) c.enqueue(new Uint8Array(p));
          c.close();
        },
      });
    expect([...((await readCapped(chunks([1, 2], [3]), 10, 3)) ?? [])]).toEqual([1, 2, 3]);
    // A compressed body's Content-Length counts the bytes on the wire; the reader yields more once decoded.
    expect([...((await readCapped(chunks([1, 2, 3, 4], [5, 6, 7, 8], [9]), 10, 2)) ?? [])]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...((await readCapped(chunks([1], [2]), 10, undefined)) ?? [])]).toEqual([1, 2]);
    const over = countingBody(5, 4);
    expect(await readCapped(over.stream, 10, undefined)).toBeUndefined();
    expect(over.seen).toEqual({ pulls: 3, cancelled: true });
  });

  /**
   * Wave-1 follow-up: with no declared length (or a wrong one), readCapped used to keep every chunk alive and then copy
   * them all into a new buffer, so a download near the cap briefly held about twice the cap. It now copies each chunk
   * as it arrives into one buffer that grows in place, so what it holds stays about the size read.
   */
  it.each([
    ['no declared length', undefined],
    ['a declared length that was too small', 1024],
  ])('readCapped keeps no chunk alive once it is copied (%s)', async (_label, declared) => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    let collected = 0;
    const registry = new FinalizationRegistry<number>(() => {
      collected++;
    });
    const N = 32;
    const SIZE = 256 * 1024;
    let sent = 0;
    let collectedBeforeEnd = -1;
    const stream = new ReadableStream<Uint8Array>(
      {
        async pull(controller) {
          if (sent === N) {
            // Everything has been read; whatever readCapped still holds is what it keeps for the result.
            for (let i = 0; i < 4; i++) {
              gc();
              await new Promise((r) => setTimeout(r, 0));
            }
            collectedBeforeEnd = collected;
            return controller.close();
          }
          const chunk = new Uint8Array(SIZE).fill(sent + 1);
          registry.register(chunk, sent);
          sent++;
          controller.enqueue(chunk);
        },
      },
      { highWaterMark: 0 },
    );
    const bytes = await readCapped(stream, 64 * 1024 * 1024, declared);
    expect(bytes?.byteLength).toBe(N * SIZE);
    expect([bytes?.[0], bytes?.[SIZE], bytes?.[N * SIZE - 1]]).toEqual([1, 2, N]);
    expect((bytes?.buffer as ArrayBuffer | undefined)?.resizable).toBe(false);
    expect(collectedBeforeEnd).toBeGreaterThanOrEqual(N - 2);
  });

  it('sniffVideoType: MP4 by its ftyp box, WebM by its EBML magic, anything else is not a video', () => {
    expect(sniffVideoType(MP4_BYTES)).toBe('video/mp4');
    expect(sniffVideoType(WEBM_BYTES)).toBe('video/webm');
    expect(sniffVideoType(new TextEncoder().encode('INTERNAL-SERVICE-RESPONSE-BODY'))).toBeUndefined();
    expect(sniffVideoType(new Uint8Array(3))).toBeUndefined();
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
    expect(res).toMatchObject({ provider: 'mock', servedModel: 'mock-video', costUsd: 0, mediaType: 'image/svg+xml', lastFrameMediaType: 'image/png' });
    expect(ledgerLines()[0]).toMatchObject({ kind: 'video', provider: 'mock', costUsd: 0, usage: { units: 5 } });
  });

  it('labels the placeholder with the request shot first, then the prompt, then call order', async () => {
    const g = gateway({ env: {} });
    const text = async (id: string) => Buffer.from((await artifacts.get(id)).bytes).toString('utf8');
    // The prompt says shot 2, the request says 4: the request wins.
    expect(await text((await g.video(req({ shot: 4 }))).artifactId)).toContain('Sample clip — shot 4');
    expect(await text((await g.video(req())).artifactId)).toContain('Sample clip — shot 2');
    expect(await text((await g.video(req({ prompt: 'The runner laces up' }))).artifactId)).toContain('Sample clip — shot 3');
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
