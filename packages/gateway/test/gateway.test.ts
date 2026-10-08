import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex } from '@byway/canonical';
import { GatewayError, type CompletionRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import { anthropicMessage, fakeAnthropic, fakeGoogle, fakeOpenAI, httpError, MemoryArtifacts } from './fakes.ts';

const ANTHROPIC_KEY = 'sk-ant-api03-test-not-a-real-key-000000';
const OPENAI_KEY = 'sk-test-not-a-real-openai-key-0000000';

let dir: string;
let artifacts: MemoryArtifacts;
let caps: { workspace: number; runs: Record<string, number> };
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-'));
  artifacts = new MemoryArtifacts();
  caps = { workspace: 100, runs: {} };
});

const instant = async (_ms: number) => {};

function gateway(over: Partial<GatewayOptions> = {}) {
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    artifacts,
    caps: { workspaceCapUsd: () => caps.workspace, runCapUsd: (id) => caps.runs[id] },
    env: {},
    retry: { sleep: instant, random: () => 0.5 },
    now: () => new Date('2026-10-07T12:00:00Z'),
    ...over,
  });
}

const req = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'critic',
  purpose: 'critic:web-page',
  profileId: 'balanced',
  tier: 'big',
  system: 'You judge pages.',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Judge this page.' }] }],
  maxOutputTokens: 1000,
  ...over,
});

const ledgerLines = () => readFileSync(join(dir, 'ledger.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

describe('gateway: profiles and providers', () => {
  it('lists only usable profiles, demo always', () => {
    expect(gateway().profiles().map((p) => p.id)).toEqual(['demo']);
    expect(gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY } }).profiles().map((p) => p.id)).toEqual(['balanced', 'best', 'demo']);
    expect(gateway({ env: { OPENAI_API_KEY: OPENAI_KEY, GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' } }).profiles().map((p) => p.id)).toEqual(['openai', 'google', 'demo']);
  });

  it('lists only the demo profile when demo mode is forced', () => {
    expect(gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, demo: true }).profiles().map((p) => p.id)).toEqual(['demo']);
  });

  it('reports configured providers without exposing keys', () => {
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY } });
    expect(g.providers().find((p) => p.provider === 'anthropic')).toEqual({ provider: 'anthropic', configured: true });
    expect(JSON.stringify([g.providers(), g.profiles(), g.profileStatus()])).not.toContain(ANTHROPIC_KEY);
  });

  it('loads keys from an env file at construction, without overriding the environment', () => {
    const envFile = join(dir, '.env.agents');
    writeFileSync(envFile, `ANTHROPIC_API_KEY=${ANTHROPIC_KEY}\nOPENAI_API_KEY=from-file\n`);
    const env: Record<string, string | undefined> = { OPENAI_API_KEY: OPENAI_KEY };
    const g = gateway({ env, envFile });
    expect(env.ANTHROPIC_API_KEY).toBe(ANTHROPIC_KEY);
    expect(env.OPENAI_API_KEY).toBe(OPENAI_KEY);
    expect(g.providers().filter((p) => p.configured).map((p) => p.provider)).toEqual(['anthropic', 'openai', 'mock']);
  });
});

describe('gateway: complete', () => {
  it('answers through the mock in the demo profile, ledgers the call and stores the bodies by hash', async () => {
    const g = gateway();
    const res = await g.complete(req({ profileId: 'demo', purpose: 'critic:prose' }));
    expect(res.provider).toBe('mock');
    expect(res.servedModel).toBe('mock-big');
    expect(res.text).toMatch(/Score: \d+\/10$/);
    expect(res.costUsd).toBe(0);
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ id: res.ledgerEntryId, seq: 1, kind: 'completion', provider: 'mock', purpose: 'critic:prose', workspaceId: 'ws-1', runId: 'run-1', stepId: 'critic' });
    for (const field of ['requestSha256', 'responseSha256'] as const) {
      expect(await artifacts.has(entry[field])).toBe(true);
      expect(entry[field]).toBe(`sha256:${sha256Hex(await artifacts.getText(entry[field]))}`);
    }
    expect(await g.verifyLedger()).toBeNull();
  });

  it('routes every profile to the mock when demo mode is forced', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ demo: true, env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const res = await g.complete(req({ profileId: 'best', tier: 'mid', purpose: 'build:prose' }));
    expect([res.provider, res.servedModel]).toEqual(['mock', 'mock-mid']);
    expect(calls).toHaveLength(0);
  });

  it('calls the profile model for the tier and prices the usage', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const res = await g.complete(req());
    expect(calls[0]).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 1000, system: 'You judge pages.' });
    // 1000 input at $4/M + 500 output at $20/M.
    expect(res.costUsd).toBeCloseTo(0.014, 9);
    expect(res).toMatchObject({ provider: 'anthropic', servedModel: 'claude-opus-5-5', usage: { inputTokens: 1000, outputTokens: 500 } });
    expect(ledgerLines()[0]).toMatchObject({ requestedModel: 'claude-opus-5-5', servedModel: 'claude-opus-5-5', costUsd: res.costUsd });
  });

  it('honours a per-request model override', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await g.complete(req({ model: { provider: 'anthropic', model: 'claude-sonnet-5-5' } }));
    expect(calls[0]).toMatchObject({ model: 'claude-sonnet-5-5' });
  });

  it('loads images from the artifact store and sends them inline', async () => {
    const { client, calls } = fakeAnthropic();
    const png = encodePng(2, 2, new Uint8Array(12));
    const record = await artifacts.put(png, 'image/png');
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await g.complete(req({ messages: [{ role: 'user', content: [{ type: 'image', artifactId: record.id, mediaType: 'image/png' }, { type: 'text', text: 'Judge it.' }] }] }));
    const messages = (calls[0] as { messages: { content: { source?: { data: string } }[] }[] }).messages;
    expect(messages[0]?.content[0]?.source?.data).toBe(Buffer.from(png).toString('base64'));
  });

  it.each([
    ['unknown profile', () => req({ profileId: 'nope' }), 'unknown-profile'],
    ['no messages', () => req({ messages: [] }), 'invalid-request'],
    ['bad tier', () => req({ tier: 'huge' as 'big' }), 'invalid-request'],
    ['bad output cap', () => req({ maxOutputTokens: 0 }), 'invalid-request'],
    ['missing purpose', () => req({ purpose: '' }), 'invalid-request'],
    ['unpriced model', () => req({ model: { provider: 'anthropic', model: 'claude-unknown-9' } }), 'invalid-request'],
    ['missing image', () => req({ messages: [{ role: 'user', content: [{ type: 'image', artifactId: 'sha256:missing', mediaType: 'image/png' }] }] }), 'invalid-request'],
  ])('rejects %s', async (_name, make, code) => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(make())).rejects.toMatchObject({ name: 'GatewayError', code });
    expect(calls).toHaveLength(0);
  });

  it('refuses a provider without a key', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ clients: { anthropic: client } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'no-credentials' });
    expect(calls).toHaveLength(0);
  });

  it('retries retryable errors and ledgers only the successful call', async () => {
    const { client, calls } = fakeAnthropic([httpError(429), httpError(529)]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await g.complete(req());
    expect(calls).toHaveLength(3);
    expect(ledgerLines()).toHaveLength(1);
  });

  it('does not retry a bad request, and keeps keys out of the error', async () => {
    const { client, calls } = fakeAnthropic([httpError(400, `invalid x-api-key ${ANTHROPIC_KEY}`)]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const err = await g.complete(req()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect((err as GatewayError).code).toBe('invalid-request');
    expect((err as GatewayError).message).not.toContain(ANTHROPIC_KEY);
    expect(calls).toHaveLength(1);
  });

  it('gives up after the retry limit with the mapped error', async () => {
    const { client, calls } = fakeAnthropic([httpError(503), httpError(503), httpError(503), httpError(503), httpError(503)]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client }, retry: { sleep: instant, random: () => 0, maxAttempts: 3 } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'provider-error', retryable: true });
    expect(calls).toHaveLength(3);
  });

  it('ledgers a refusal (it may be billed) and then raises refused', async () => {
    const { client } = fakeAnthropic([anthropicMessage({ stop_reason: 'refusal', stop_details: { category: 'bio' }, content: [], usage: { input_tokens: 1000, output_tokens: 0 } })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'refused' });
    expect(ledgerLines()[0]).toMatchObject({ costUsd: 0.004, servedModel: 'claude-opus-5-5' });
  });

  it('prices a refusal fallback by the models that ran', async () => {
    const { client } = fakeAnthropic([
      anthropicMessage({
        model: 'claude-opus-4-8',
        usage: {
          input_tokens: 1000,
          output_tokens: 1000,
          iterations: [
            { type: 'message', model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 0 },
            { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 1000 },
          ],
        },
      }),
    ]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const res = await g.complete(req());
    // Opus 5.5: 1000 in at $4/M. Opus 4.8: 1000 in at $5/M + 1000 out at $25/M.
    expect(res.costUsd).toBeCloseTo(0.004 + 0.005 + 0.025, 9);
    expect(res.servedModel).toBe('claude-opus-4-8');
  });

  it('records the OpenRouter host and prefers its reported cost', async () => {
    const { client, calls } = fakeOpenAI([{ model: 'anthropic/claude-opus-5.5', provider: 'Anthropic', choices: [{ message: { content: 'Choice: A' } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0123 } }]);
    const g = gateway({ env: { OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000' }, clients: { openrouter: client } });
    const res = await g.complete(req({ profileId: 'openrouter' }));
    expect(calls[0]).toMatchObject({ model: 'anthropic/claude-opus-5.5', provider: { only: ['anthropic'], allow_fallbacks: false } });
    expect(res.costUsd).toBe(0.0123);
    expect(ledgerLines()[0]).toMatchObject({ provider: 'openrouter', upstreamProvider: 'Anthropic' });
  });

  it('never writes a key to the ledger or the stored bodies, even when a prompt contains one', async () => {
    const { client } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await g.complete(req({ messages: [{ role: 'user', content: [{ type: 'text', text: `my key is ${ANTHROPIC_KEY}` }] }] }));
    expect(readFileSync(join(dir, 'ledger.jsonl'), 'utf8')).not.toContain(ANTHROPIC_KEY);
    expect(artifacts.allText()).not.toContain(ANTHROPIC_KEY);
    expect(artifacts.allText()).toContain('[redacted]');
  });
});

describe('gateway: budgets', () => {
  it('refuses a call whose worst case would break the workspace cap, before calling', async () => {
    caps.workspace = 0.01;
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    // 1000 output tokens at $20/M alone is $0.02.
    const err = await g.complete(req()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'budget-exceeded', retryable: false });
    expect((err as { budget?: unknown }).budget).toMatchObject({ scope: 'workspace', capUsd: 0.01, spentUsd: 0 });
    expect(calls).toHaveLength(0);
  });

  it('refuses a call that would break the run cap', async () => {
    caps.runs['run-1'] = 0.015;
    const { client } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'budget-exceeded' });
    // Another run is unaffected.
    await expect(g.complete(req({ runId: 'run-2' }))).resolves.toMatchObject({ provider: 'anthropic' });
  });

  it('counts what has already been spent', async () => {
    caps.runs['run-1'] = 0.045;
    const { client } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    // Each call: estimate ~$0.0201, actual $0.014; the third would reach ~$0.048.
    await g.complete(req());
    await g.complete(req());
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'budget-exceeded' });
    expect((await g.spend('ws-1')).byRun['run-1']).toBeCloseTo(0.028, 9);
  });

  it('reserves in-flight estimates so parallel calls cannot overshoot together', async () => {
    caps.workspace = 0.03;
    const { client } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const results = await Promise.allSettled([g.complete(req()), g.complete(req())]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
  });

  it('lets demo calls through with a zero budget', async () => {
    caps.workspace = 0;
    await expect(gateway().complete(req({ profileId: 'demo' }))).resolves.toMatchObject({ costUsd: 0 });
  });

  it('summarizes spend by workspace and run against the cap', async () => {
    const { client } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await g.complete(req());
    await g.complete(req({ runId: 'run-2' }));
    await g.complete(req({ workspaceId: 'ws-other' }));
    const { runId: _omit, ...noRun } = req();
    await g.complete(noRun);
    const s = await g.spend('ws-1');
    expect(s.workspaceId).toBe('ws-1');
    expect(s.capUsd).toBe(100);
    expect(s.spentUsd).toBeCloseTo(0.042, 9);
    expect(Object.keys(s.byRun).sort()).toEqual(['run-1', 'run-2']);
  });
});

describe('gateway: images', () => {
  it('stores a demo image and ledgers it', async () => {
    const g = gateway();
    const res = await g.image({ workspaceId: 'ws-1', runId: 'run-1', stepId: 'asset', purpose: 'asset:web-page', profileId: 'demo', prompt: 'A loaf of bread', size: '1536x1024' });
    expect(res).toMatchObject({ provider: 'mock', mediaType: 'image/png', costUsd: 0 });
    expect((await artifacts.get(res.artifactId)).record.mediaType).toBe('image/png');
    expect(ledgerLines()[0]).toMatchObject({ id: res.ledgerEntryId, kind: 'image', usage: { units: 1 } });
  });

  it('prices OpenAI images by the tokens the API reports', async () => {
    const { client } = fakeOpenAI();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_KEY }, clients: { openai: client } });
    const res = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'best', prompt: 'A loaf', size: '1024x1024' });
    // 20 text tokens at $5/M + 4000 image tokens at $30/M.
    expect(res.costUsd).toBeCloseTo(0.0001 + 0.12, 9);
    expect(Buffer.from((await artifacts.get(res.artifactId)).bytes).toString()).toBe('png-bytes');
  });

  it('prices Google images per image plus prompt tokens, keeping the returned media type', async () => {
    const { client } = fakeGoogle();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' }, clients: { google: client } });
    const res = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf', size: '1024x1536' });
    expect(res.mediaType).toBe('image/jpeg');
    expect(res.costUsd).toBeCloseTo(0.0336 + 30 * 1.5e-6, 9);
  });

  it('fails clearly for a profile without an image model, or without the image key', async () => {
    const g = gateway({ env: { OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000', ANTHROPIC_API_KEY: ANTHROPIC_KEY } });
    await expect(g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'openrouter', prompt: 'x', size: '1024x1024' })).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'x', size: '1024x1024' })).rejects.toMatchObject({ code: 'no-credentials' });
  });

  it('refuses an image that would break the budget', async () => {
    caps.workspace = 0.05;
    const { client, calls } = fakeOpenAI();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_KEY }, clients: { openai: client } });
    await expect(g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'best', prompt: 'x', size: '1024x1024' })).rejects.toMatchObject({ code: 'budget-exceeded' });
    expect(calls).toHaveLength(0);
  });
});

describe('gateway: ledger integrity', () => {
  it('verifies an intact ledger and names a tampered entry', async () => {
    const g = gateway();
    for (let i = 0; i < 3; i++) await g.complete(req({ profileId: 'demo' }));
    expect(await g.verifyLedger()).toBeNull();
    const path = join(dir, 'ledger.jsonl');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    const second = JSON.parse(lines[1] as string);
    lines[1] = JSON.stringify({ ...second, purpose: 'build:prose' });
    writeFileSync(path, `${lines.join('\n')}\n`);
    expect(await g.verifyLedger()).toBe(second.id);
  });
});
