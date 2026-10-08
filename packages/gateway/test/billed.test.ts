import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type ArtifactRecord, type CompletionRequest, type ImageRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { fakeAnthropic, fakeFal, fakeFetch, fakeGoogle, fakeOpenAI, MemoryArtifacts } from './fakes.ts';

/**
 * ENG-3 and ENG-5 (convention C5): once a provider has answered, the call was billed, so it is ledgered before anything
 * else can fail; a local failure afterwards is a non-retryable GatewayError that says so, because a retry would pay again.
 */
const KEYS = {
  ANTHROPIC_API_KEY: 'sk-ant-test-key-123456',
  OPENAI_API_KEY: 'sk-test-not-a-real-openai-key-0000000',
  GEMINI_API_KEY: 'AIza-test-not-real-0000000000000',
  FAL_KEY: '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff',
};

/** An artifact store whose writes fail after `okWrites` successful ones (a full disk, a locked file). */
class FailingArtifacts extends MemoryArtifacts {
  okWrites: number;
  constructor(okWrites: number) {
    super();
    this.okWrites = okWrites;
  }
  override async put(bytes: Uint8Array, mediaType: string): Promise<ArtifactRecord> {
    if (this.okWrites <= 0) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' });
    this.okWrites -= 1;
    return super.put(bytes, mediaType);
  }
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-billed-'));
});

function gateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => 100 },
    env: KEYS,
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => new Date('2026-10-07T12:00:00Z'),
    ...over,
  });
}

const ledgerLines = (): Record<string, unknown>[] =>
  existsSync(join(dir, 'ledger.jsonl')) ? readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [];

const completion = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'framings',
  purpose: 'build:prose',
  profileId: 'balanced',
  tier: 'mid',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 500,
  ...over,
});

const imageReq = (over: Partial<ImageRequest> = {}): ImageRequest => ({ workspaceId: 'ws-1', runId: 'run-1', stepId: 'asset', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf of bread', size: '1024x1024', ...over });

/** Holds the ledger's cross-process lock file the way another process does while it appends; returns the release. */
function holdLedgerLock(): () => void {
  const lock = join(dir, 'ledger.jsonl.lock');
  writeFileSync(lock, '');
  return () => rmSync(lock, { force: true });
}

describe('a billed completion is ledgered before anything else can fail (ENG-3)', () => {
  it('ledgers the call even when storing its request and response bodies fails, and fails without inviting a retry', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ artifacts: new FailingArtifacts(0), clients: { anthropic: client } });
    const err = (await g.complete(completion()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/billed/);
    expect(calls).toHaveLength(1);
    expect(ledgerLines()).toEqual([expect.objectContaining({ stepId: 'framings', purpose: 'build:prose', kind: 'completion' })]);
  });

  it('waits out another process holding the ledger lock instead of failing a call that was already paid for', async () => {
    const { client, calls } = fakeAnthropic();
    const release = holdLedgerLock();
    const g = gateway({ clients: { anthropic: client }, billedLedgerWaitMs: 5_000 });
    const pending = g.complete(completion());
    await new Promise((r) => setTimeout(r, 300));
    // The other process finishes its append and lets go.
    release();
    const res = await pending;
    expect(calls).toHaveLength(1);
    expect(ledgerLines()).toEqual([expect.objectContaining({ id: res.ledgerEntryId })]);
  });

  it('fails a call it could not ledger with a non-retryable GatewayError saying it was billed (never a plain Error Temporal retries)', async () => {
    const { client, calls } = fakeAnthropic();
    holdLedgerLock();
    const g = gateway({ clients: { anthropic: client }, billedLedgerWaitMs: 100 });
    const err = (await g.complete(completion()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false });
    expect(err.message).toMatch(/billed/);
    expect(err.message).toMatch(/ledger/);
    expect(calls).toHaveLength(1);
  });

  it('waits up to two minutes by default for the ledger lock on a billed call', () => {
    expect(gateway().billedLedgerWaitMs).toBe(120_000);
  });
});

describe('a billed image is ledgered before anything else can fail (ENG-3)', () => {
  it('ledgers a generated image whose bytes could not be stored, then fails without inviting a retry', async () => {
    const { client, calls } = fakeOpenAI();
    const g = gateway({ artifacts: new FailingArtifacts(0), clients: { openai: client } });
    const err = (await g.image(imageReq({ profileId: 'best' })).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/billed/);
    expect(calls).toHaveLength(1);
    expect(ledgerLines()).toEqual([expect.objectContaining({ kind: 'image', provider: 'openai' })]);
  });
});

describe('a billed clip is ledgered even when keeping it fails (ENG-3, as video() promises)', () => {
  it('ledgers the clip when storing it fails, then fails without inviting a retry', async () => {
    const artifacts = new FailingArtifacts(1);
    const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
    const fal = fakeFal();
    const g = gateway({ artifacts, clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const err = (await g
      .video({ workspaceId: 'ws-1', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'Shot 1: dawn', startFrameArtifactId: startFrame, durationSec: 5 })
      .catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err.retryable).toBe(false);
    expect(err.message).toMatch(/billed/);
    expect(fal.calls.filter((c) => !c.endpoint.includes('extract-frame'))).toHaveLength(1);
    expect(ledgerLines()).toEqual([expect.objectContaining({ kind: 'video', provider: 'fal' })]);
  });
});

describe('an image response with no image is a refusal, not a fake 502 (ENG-5)', () => {
  it('Google: a text-only STOP answer is ledgered once and refused, with no retry', async () => {
    const { client, calls } = fakeGoogle([
      {
        modelVersion: 'gemini-nano-banana-2.1',
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Here is a description of a loaf of bread.' }] } }],
        usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 40 },
      },
    ]);
    const g = gateway({ clients: { google: client } });
    const err = (await g.image(imageReq()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.message).toMatch(/no image/);
    expect(err.message).not.toMatch(/502/);
    expect(calls).toHaveLength(1);
    const lines = ledgerLines();
    expect(lines).toHaveLength(1);
    // Billed for its tokens; no image, so no per-image charge.
    expect(lines[0]).toMatchObject({ kind: 'image', usage: { inputTokens: 30, outputTokens: 40, units: 0 } });
    expect(lines[0]?.costUsd as number).toBeCloseTo(30 * 1.5e-6, 9);
  });

  it('OpenAI: an images response with no data is ledgered once and refused, with no retry', async () => {
    const { client, calls } = fakeOpenAI([], [{ data: [], usage: { input_tokens: 20, output_tokens: 0 } }]);
    const g = gateway({ clients: { openai: client } });
    const err = (await g.image(imageReq({ profileId: 'best' })).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(calls).toHaveLength(1);
    expect(ledgerLines()).toEqual([expect.objectContaining({ kind: 'image', usage: { inputTokens: 20, outputTokens: 0, units: 0 } })]);
  });
});
