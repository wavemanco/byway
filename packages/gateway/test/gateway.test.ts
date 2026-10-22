import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex } from '@byway/canonical';
import { GatewayError, type BudgetDetails, type CompletionRequest } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { encodePng } from '../src/mock/png.ts';
import type { AnthropicMessageLike } from '../src/providers/anthropic.ts';
import type { ProviderAdapter } from '../src/providers/types.ts';
import { anthropicMessage, fakeAnthropic, fakeGoogle, fakeOpenAI, fetchFailed, httpError, MemoryArtifacts } from './fakes.ts';
import { memorySpendBook } from '../src/memory-book.ts';

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
    spendBook: memorySpendBook(),
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
    // The ledger line would name run or step "", which the spend book refuses to count (ledgerEntryProblem).
    ['empty run id', () => req({ runId: '' }), 'invalid-request'],
    ['empty step id', () => req({ stepId: '' }), 'invalid-request'],
    ['unpriced model', () => req({ model: { provider: 'anthropic', model: 'claude-unknown-9' } }), 'invalid-request'],
    ['missing image', () => req({ messages: [{ role: 'user', content: [{ type: 'image', artifactId: 'sha256:missing', mediaType: 'image/png' }] }] }), 'invalid-request'],
  ])('rejects %s', async (_name, make, code) => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(make())).rejects.toMatchObject({ name: 'GatewayError', code });
    expect(calls).toHaveLength(0);
  });

  it("refuses a provider without a key when other keys exist (with no keys at all, it is demo mode)", async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { OPENAI_API_KEY: OPENAI_KEY }, clients: { anthropic: client } });
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
    // Overloaded answers carry Anthropic's own error body, so nothing was billed and each is retried (ADR-0091).
    const overloaded = () => httpError(503, 'overloaded', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const { client, calls } = fakeAnthropic([overloaded(), overloaded(), overloaded(), overloaded(), overloaded()]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client }, retry: { sleep: instant, random: () => 0, maxAttempts: 3 } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'provider-error', retryable: true });
    expect(calls).toHaveLength(3);
  });

  it('sends a completion once more after a reset that may have been billed, and ledgers only the answer (F03)', async () => {
    // Node's fetch wraps the reset: the code is only on the cause, which the old check never read (non-retryable).
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNRESET')]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).resolves.toMatchObject({ provider: 'anthropic' });
    expect(calls).toHaveLength(2);
    expect(ledgerLines()).toHaveLength(1);
  });

  it('fails plainly on a second attempt that may have been billed, without a third (F03)', async () => {
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNRESET'), httpError(502), anthropicMessage()]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'provider-error', message: expect.stringMatching(/502/) });
    expect(calls).toHaveLength(2);
    expect(existsSync(join(dir, 'ledger.jsonl'))).toBe(false);
  });

  it('retries a refused connection like any unbilled failure (nothing was written)', async () => {
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNREFUSED'), fetchFailed('ECONNREFUSED'), fetchFailed('ECONNREFUSED')]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).resolves.toMatchObject({ provider: 'anthropic' });
    expect(calls).toHaveLength(4);
  });

  it('ledgers each refusal (it may be billed), asks once more, and then raises refused (ADR-0102)', async () => {
    const refusal = () => anthropicMessage({ stop_reason: 'refusal', stop_details: { category: 'bio' }, content: [], usage: { input_tokens: 1000, output_tokens: 0 } });
    const { client } = fakeAnthropic([refusal(), refusal()]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    await expect(g.complete(req())).rejects.toMatchObject({ code: 'refused', retryable: false });
    expect(ledgerLines()).toEqual([
      expect.objectContaining({ costUsd: 0.004, servedModel: 'claude-opus-5-5', declined: { reason: 'bio' } }),
      expect.objectContaining({ costUsd: 0.004, servedModel: 'claude-opus-5-5', declined: { reason: 'bio' }, retryOf: ledgerLines()[0]!.id }),
    ]);
  });

  it('prices each billed attempt an answer lists at the rates of the model that ran it', async () => {
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

  it("reports stopReason 'end' for a whole answer and 'max-tokens' for one cut off at the output cap", async () => {
    const { client } = fakeAnthropic([anthropicMessage(), anthropicMessage({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '- Tighten the' }] })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    expect(await g.complete(req())).toMatchObject({ stopReason: 'end' });
    const cut = await g.complete(req());
    expect(cut).toMatchObject({ stopReason: 'max-tokens', text: '- Tighten the', provider: 'anthropic' });
    // A truncated answer is still a billed call: priced and ledgered like any other.
    expect(cut.costUsd).toBeCloseTo(0.014, 9);
    expect(ledgerLines().map((e) => e.id)).toEqual([expect.any(String), cut.ledgerEntryId]);
  });

  it("maps every adapter's truncation to stopReason 'max-tokens'", async () => {
    const openai = fakeOpenAI([{ model: 'gpt-6-astra', choices: [{ finish_reason: 'length', message: { content: '{"a":' } }], usage: { prompt_tokens: 10, completion_tokens: 1000 } }]);
    const google = fakeGoogle([{ modelVersion: 'gemini-3.1-pro-preview', candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '- Drop' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 1000 } }]);
    const g = gateway({ env: { OPENAI_API_KEY: OPENAI_KEY, GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' }, clients: { openai: openai.client, google: google.client } });
    expect(await g.complete(req({ profileId: 'openai' }))).toMatchObject({ provider: 'openai', stopReason: 'max-tokens' });
    expect(await g.complete(req({ profileId: 'google' }))).toMatchObject({ provider: 'google', stopReason: 'max-tokens' });
    expect(await g.complete(req({ profileId: 'openai' }))).toMatchObject({ provider: 'openai', stopReason: 'end' });
  });

  it("answers demo calls with stopReason 'end' unless a test responder truncates", async () => {
    expect(await gateway().complete(req({ profileId: 'demo', purpose: 'build:prose' }))).toMatchObject({ provider: 'mock', stopReason: 'end' });
    const g = gateway({ mockResponders: { 'build:prose': () => ({ text: '# Half a memo', truncated: true }) } });
    expect(await g.complete(req({ profileId: 'demo', purpose: 'build:prose' }))).toMatchObject({ text: '# Half a memo', stopReason: 'max-tokens' });
  });

  it('never writes a key to the ledger or the stored bodies when a provider echoes one in what it answers', async () => {
    // A prompt holding a key is refused before it is sent (below); a provider can still put one in a refusal's details.
    const refusal = () => anthropicMessage({ stop_reason: 'refusal', stop_details: { category: `policy ${ANTHROPIC_KEY}` }, content: [], usage: { input_tokens: 1000, output_tokens: 0 } });
    const { client } = fakeAnthropic([refusal(), refusal()]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const err = (await g.complete(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused' });
    expect(err.message).not.toContain(ANTHROPIC_KEY);
    expect(readFileSync(join(dir, 'ledger.jsonl'), 'utf8')).not.toContain(ANTHROPIC_KEY);
    expect(artifacts.allText()).not.toContain(ANTHROPIC_KEY);
    expect(artifacts.allText()).toContain('[redacted]');
  });
});

/**
 * F19 at the provider boundary: provider JSON can carry a lone surrogate through a \u escape. A call the provider
 * answered was billed, so it must be ledgered and counted (ENG-3) even when what the provider reported has no
 * canonical form.
 */
describe('gateway: malformed provider labels still reach the ledger', () => {
  const anthropicGateway = (reply: AnthropicMessageLike) => {
    const { client } = fakeAnthropic([reply]);
    return gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
  };

  it('ledgers and counts a billed call whose served model holds a lone surrogate, keeping the exact reply stored', async () => {
    const g = anthropicGateway(anthropicMessage({ model: 'claude-opus-5-5\ud800' }));
    const res = await g.complete(req());
    const [entry] = ledgerLines();
    expect(entry.servedModel).toBe('claude-opus-5-5�');
    expect(entry.costUsd).toBeCloseTo(0.014, 9);
    expect((await g.spend('ws-1')).spentUsd).toBeCloseTo(0.014, 9);
    expect(await g.verifyLedger()).toBeNull();
    const response = await artifacts.getText(entry.responseSha256);
    expect(response.isWellFormed()).toBe(true);
    expect(response).toContain('claude-opus-5-5\\ud800');
    expect(entry.responseSha256).toBe(`sha256:${sha256Hex(response)}`);
    // The caller gets the value the ledger recorded (ADR-0088); the exact reply stays in the stored response.
    expect(res.servedModel).toBe(entry.servedModel);
  });

  it('ledgers an upstream host that holds a lone surrogate with U+FFFD in its place', async () => {
    const { client } = fakeOpenAI([{ model: 'anthropic/claude-opus-5.5', provider: 'Anthropic\ud800', choices: [{ message: { content: 'Choice: A' } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0123 } }]);
    const g = gateway({ env: { OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000' }, clients: { openrouter: client } });
    await g.complete(req({ profileId: 'openrouter' }));
    expect(ledgerLines()[0]).toMatchObject({ provider: 'openrouter', upstreamProvider: 'Anthropic�', costUsd: 0.0123 });
    expect(await g.verifyLedger()).toBeNull();
  });

  it('ledgers a reply with a lone surrogate in a property name, under the hash of the text it stores', async () => {
    const g = anthropicGateway({ ...anthropicMessage(), 'x\ud800': 1 } as AnthropicMessageLike);
    await g.complete(req());
    const [entry] = ledgerLines();
    const response = await artifacts.getText(entry.responseSha256);
    expect(response.isWellFormed()).toBe(true);
    expect(response).toContain('"x\\ud800":1');
    expect(entry.responseSha256).toBe(`sha256:${sha256Hex(response)}`);
    expect(await g.verifyLedger()).toBeNull();
  });

  it('ledgers a served model that is not a string as its JSON text', async () => {
    const g = anthropicGateway(anthropicMessage({ model: ['claude\ud800'] as unknown as string }));
    await g.complete(req());
    expect(ledgerLines()[0].servedModel).toBe('["claude\\ud800"]');
    expect(ledgerLines()[0].priceBasis).toBe('assumed');
    expect((await g.spend('ws-1')).spentUsd).toBeCloseTo(0.014, 9);
    expect(await g.verifyLedger()).toBeNull();
  });
});

/**
 * An answer that names no served model (the field missing, null or empty) was still billed. A missing field used to fail
 * after billing with a raw TypeError (the label was scrubbed as if it were text) and was counted as "may have been
 * billed"; a null or empty one was recorded as the served model "null" or "".
 * It is settled as the requested model, at its rates, flagged `priceBasis: 'assumed'` (ADR-0095 decision 7).
 */
describe('gateway: an answer that names no served model is settled as the requested model, assumed', () => {
  const noModel: [string, unknown][] = [
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
  ];

  it.each(noModel)('an Anthropic completion (model %s)', async (_what, model) => {
    const { client } = fakeAnthropic([anthropicMessage({ model: model as string })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const res = await g.complete(req());
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ requestedModel: 'claude-opus-5-5', servedModel: 'claude-opus-5-5', priceBasis: 'assumed' });
    // 1,000 input tokens at $4/M and 500 output at $20/M: claude-opus-5-5's own rates.
    expect(entry.costUsd).toBeCloseTo(0.014, 9);
    expect(res).toMatchObject({ servedModel: 'claude-opus-5-5', costUsd: entry.costUsd, ledgerEntryId: entry.id });
    expect(await g.spend('ws-1')).toMatchObject({ spentUsd: entry.costUsd, inFlightUsd: 0, uncertainUsd: 0, assumedPricing: { calls: 1, usd: entry.costUsd } });
    expect(await g.verifyLedger()).toBeNull();
  });

  it.each(noModel)('an OpenAI completion (model %s)', async (_what, model) => {
    const { client } = fakeOpenAI([{ model: model as string, choices: [{ finish_reason: 'stop', message: { content: 'Choice: A' } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } }]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_KEY }, clients: { openai: client } });
    const res = await g.complete(req({ profileId: 'openai' }));
    // gpt-6-astra: 1,000 input tokens at $10/M and 100 output at $50/M.
    expect(ledgerLines()).toEqual([expect.objectContaining({ id: res.ledgerEntryId, requestedModel: 'gpt-6-astra', servedModel: 'gpt-6-astra', priceBasis: 'assumed', costUsd: 0.015 })]);
    expect(res.servedModel).toBe('gpt-6-astra');
  });

  it('an OpenRouter completion that reports its cost: the cost it reports, the requested model, flagged assumed', async () => {
    const { client } = fakeOpenAI([{ provider: 'Anthropic', choices: [{ message: { content: 'Choice: A' } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0123 } } as never]);
    const g = gateway({ env: { OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000' }, clients: { openrouter: client } });
    const res = await g.complete(req({ profileId: 'openrouter' }));
    expect(ledgerLines()).toEqual([expect.objectContaining({ servedModel: 'anthropic/claude-opus-5.5', upstreamProvider: 'Anthropic', priceBasis: 'assumed', costUsd: 0.0123 })]);
    expect(res).toMatchObject({ servedModel: 'anthropic/claude-opus-5.5', costUsd: 0.0123 });
  });

  it.each(noModel)('an image (model %s)', async (_what, model) => {
    const adapter: ProviderAdapter = {
      id: 'google',
      complete: async () => {
        throw new Error('not used');
      },
      image: async () => ({ bytes: encodePng(2, 2, new Uint8Array(12).fill(9)), mediaType: 'image/png', servedModel: model as string, usage: { inputTokens: 30, outputTokens: 40, units: 1 }, requestBody: {}, responseBody: {} }),
    };
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, GEMINI_API_KEY: 'AIza-test-not-real-0000000000000' }, adapters: { google: adapter } });
    const res = await g.image({ workspaceId: 'ws-1', runId: 'run-1', stepId: 'asset', purpose: 'asset:web-page', profileId: 'balanced', prompt: 'A loaf', size: '1024x1024' });
    // gemini-nano-banana-2.1: $0.0336 an image, 30 prompt tokens at $1.50/M and 40 text and thinking tokens at $7.50/M.
    expect(ledgerLines()).toEqual([expect.objectContaining({ id: res.ledgerEntryId, kind: 'image', requestedModel: 'gemini-nano-banana-2.1', servedModel: 'gemini-nano-banana-2.1', priceBasis: 'assumed' })]);
    expect(res.costUsd).toBeCloseTo(0.0336 + 30 * 1.5e-6 + 40 * 7.5e-6, 9);
    expect(res.servedModel).toBe('gemini-nano-banana-2.1');
    expect(await g.spend('ws-1')).toMatchObject({ uncertainUsd: 0, assumedPricing: { calls: 1 } });
  });
});

describe('gateway: held provider keys (ADR-0088)', () => {
  const OPENROUTER_KEY = 'sk-or-v1-test-not-real-000000';
  const withKey = (text: string) => req({ messages: [{ role: 'user', content: [{ type: 'text', text }] }] });
  const nothingWritten = () => {
    expect(existsSync(join(dir, 'ledger.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'exposure.jsonl'))).toBe(false);
  };

  it.each([
    ['a user message', () => withKey(`Here is my key ${ANTHROPIC_KEY}, keep it safe.`)],
    ['the system text', () => req({ system: `Use ${ANTHROPIC_KEY} when asked.` })],
    ['a later text part', () => req({ messages: [{ role: 'user', content: [{ type: 'text', text: 'Judge this.' }, { type: 'text', text: `p.s. ${ANTHROPIC_KEY}` }] }] })],
  ])('refuses a completion whose %s holds a key, before any reservation, exposure record or call', async (_where, make) => {
    caps.workspace = 0.03;
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const err = (await g.complete(make()).catch((e: unknown) => e)) as GatewayError & { heldKey?: string };
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'invalid-request', retryable: false, heldKey: 'ANTHROPIC_API_KEY' });
    expect(err.message).toContain('ANTHROPIC_API_KEY');
    expect(err.message).not.toContain(ANTHROPIC_KEY);
    expect(calls).toHaveLength(0);
    nothingWritten();
    // No reservation was left behind: a clean call fits the same small cap (its estimate is about $0.02).
    await expect(g.complete(req())).resolves.toMatchObject({ provider: 'anthropic' });
  });

  it('refuses an image whose prompt holds any held key, before any call', async () => {
    const { client, calls } = fakeOpenAI();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_KEY }, clients: { openai: client } });
    const err = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'best', prompt: `A poster that reads ${OPENAI_KEY}`, size: '1024x1024' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'GatewayError', code: 'invalid-request', heldKey: 'OPENAI_API_KEY' });
    expect(calls).toHaveLength(0);
    nothingWritten();
  });

  it('refuses in demo mode too: the mock is a provider like any other', async () => {
    const g = gateway({ demo: true, env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY } });
    await expect(g.complete(withKey(`key: ${ANTHROPIC_KEY}`))).rejects.toMatchObject({ code: 'invalid-request', heldKey: 'ANTHROPIC_API_KEY' });
    nothingWritten();
  });

  it('rejects a billed answer that holds a key: ledgered first, never returned, and not retried', async () => {
    const { client, calls } = fakeAnthropic([anthropicMessage({ content: [{ type: 'text', text: `Echo ${ANTHROPIC_KEY}` }] })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    const err = (await g.complete(req()).catch((e: unknown) => e)) as GatewayError & { heldKey?: string };
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'provider-error', retryable: false, heldKey: 'ANTHROPIC_API_KEY' });
    expect(err.message).toMatch(/billed.*ANTHROPIC_API_KEY.*not retried/s);
    expect(err.message).not.toContain(ANTHROPIC_KEY);
    expect(calls).toHaveLength(1);
    const lines = ledgerLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].costUsd).toBeGreaterThan(0);
    expect(readFileSync(join(dir, 'ledger.jsonl'), 'utf8')).not.toContain(ANTHROPIC_KEY);
    expect(artifacts.allText()).not.toContain(ANTHROPIC_KEY);
    expect(await artifacts.getText(lines[0].responseSha256)).toContain('Echo [redacted]');
  });

  it('returns a clean answer byte for byte, even one quoting a key-shaped string byway does not hold', async () => {
    const text = 'The fixture uses sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX as a placeholder.';
    const { client } = fakeAnthropic([anthropicMessage({ content: [{ type: 'text', text }] })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    expect((await g.complete(req())).text).toBe(text);
  });

  it('scrubs a key out of the served model and the upstream host, in the ledger and the result, without refusing the call', async () => {
    const anthropic = fakeAnthropic([anthropicMessage({ model: `claude-opus-5-5 ${ANTHROPIC_KEY}` })]);
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENROUTER_API_KEY: OPENROUTER_KEY }, clients: { anthropic: anthropic.client, openrouter: fakeOpenAI([{ model: 'anthropic/claude-opus-5.5', provider: `Anthropic ${OPENROUTER_KEY}`, choices: [{ message: { content: 'Choice: A' } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0123 } }]).client } });
    const served = await g.complete(req());
    expect(served.servedModel).toBe('claude-opus-5-5 [redacted]');
    const routed = await g.complete(req({ profileId: 'openrouter' }));
    expect(routed.text).toBe('Choice: A');
    const ledger = readFileSync(join(dir, 'ledger.jsonl'), 'utf8');
    expect(ledger).not.toContain(ANTHROPIC_KEY);
    expect(ledger).not.toContain(OPENROUTER_KEY);
    expect(ledgerLines().map((e) => [e.servedModel, e.upstreamProvider])).toEqual([
      ['claude-opus-5-5 [redacted]', undefined],
      ['anthropic/claude-opus-5.5', 'Anthropic [redacted]'],
    ]);
    expect(await g.verifyLedger()).toBeNull();
  });

  it('scrubs a key out of an image’s served model and keeps the image: nothing is bought twice', async () => {
    let made = 0;
    const adapter: ProviderAdapter = {
      id: 'openai',
      complete: async () => {
        throw new Error('not used');
      },
      image: async (r) => {
        made++;
        return { bytes: encodePng(2, 2, new Uint8Array(12)), mediaType: 'image/png', servedModel: `${r.model} ${OPENAI_KEY}`, usage: { inputTokens: 20, outputTokens: 4000 }, requestBody: { model: r.model }, responseBody: {} };
      },
    };
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY, OPENAI_API_KEY: OPENAI_KEY }, adapters: { openai: adapter } });
    const res = await g.image({ workspaceId: 'ws-1', purpose: 'asset:web-page', profileId: 'best', prompt: 'A loaf', size: '1024x1024' });
    expect(made).toBe(1);
    expect(res.servedModel).toMatch(/\[redacted\]$/);
    expect(res.servedModel).not.toContain(OPENAI_KEY);
    expect(readFileSync(join(dir, 'ledger.jsonl'), 'utf8')).not.toContain(OPENAI_KEY);
    expect(ledgerLines()[0].servedModel).toBe(res.servedModel);
  });
});

describe('gateway: budgets', () => {
  it('refuses a call whose estimated cost would break the workspace cap, before calling', async () => {
    caps.workspace = 0.01;
    const { client, calls } = fakeAnthropic();
    const g = gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, clients: { anthropic: client } });
    // 1000 output tokens at $20/M alone is $0.02.
    const err = await g.complete(req()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'budget-exceeded', retryable: false });
    // An estimate, said as one (ADR-0091): not "may cost up to".
    expect((err as Error).message).toMatch(/and this call is estimated at \$0\.0\d{3}$/);
    // The contract's GatewayError carries the details: no cast to a gateway-local type needed.
    const budget: BudgetDetails | undefined = (err as GatewayError).budget;
    expect(budget).toMatchObject({ scope: 'workspace', capUsd: 0.01, spentUsd: 0, reservedUsd: 0 });
    // Both are rounded to the micro-dollar separately.
    expect(budget?.shortfallUsd).toBeCloseTo(budget!.estimateUsd - 0.01, 5);
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

describe('gateway: demo (contracts v4, Gateway.demo)', () => {
  it('is true when demo mode is forced or no key is configured, false otherwise', () => {
    expect(gateway().demo).toBe(true);
    expect(gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY } }).demo).toBe(false);
    expect(gateway({ env: { ANTHROPIC_API_KEY: ANTHROPIC_KEY }, demo: true }).demo).toBe(true);
    // Blank values are not keys.
    expect(gateway({ env: { ANTHROPIC_API_KEY: '  ', OPENAI_API_KEY: '' } }).demo).toBe(true);
  });

  it('routes every call to the mock when there are no keys, whatever profile is named', async () => {
    const { client, calls } = fakeAnthropic();
    const g = gateway({ clients: { anthropic: client } });
    expect(await g.complete(req({ profileId: 'best', tier: 'mid', purpose: 'build:prose' }))).toMatchObject({ provider: 'mock', servedModel: 'mock-mid', costUsd: 0 });
    expect(await g.image({ workspaceId: 'ws-1', purpose: 'asset.briefs:prose', profileId: 'balanced', prompt: 'A loaf', size: '1024x1024' })).toMatchObject({ provider: 'mock' });
    expect(calls).toHaveLength(0);
    expect(g.profiles().map((p) => p.id)).toEqual(['demo']);
  });

  it('follows the environment: keys read at call time end demo mode', () => {
    const env: Record<string, string | undefined> = {};
    const g = gateway({ env });
    expect(g.demo).toBe(true);
    env.ANTHROPIC_API_KEY = ANTHROPIC_KEY;
    expect(g.demo).toBe(false);
  });
});

describe('gateway: prompt provenance (contracts v4, spec §3.3 "Provenance")', () => {
  const prompt = { id: 'product.c1.critic', version: 2, hash: `sha256:${'c'.repeat(64)}`, fidelity: 'paraphrase' as const };

  it('writes the prompt ref into the ledger entry, inside the hash chain', async () => {
    const g = gateway();
    const res = await g.complete(req({ profileId: 'demo', prompt }));
    const [entry] = ledgerLines();
    expect(entry).toMatchObject({ id: res.ledgerEntryId, prompt });
    expect(await g.verifyLedger()).toBeNull();
    // A call without a template leaves the field out entirely.
    await g.complete(req({ profileId: 'demo' }));
    expect(ledgerLines()[1]).not.toHaveProperty('prompt');
    expect(await g.verifyLedger()).toBeNull();
    // The provenance is covered: changing it breaks the chain at that entry.
    const path = join(dir, 'ledger.jsonl');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    lines[0] = (lines[0] as string).replace('"version":2', '"version":1');
    writeFileSync(path, `${lines.join('\n')}\n`);
    // The edit keeps the file's size and can land in the last append's mtime tick (Windows), which verify()'s cache
    // would not see (ADR-0091): move the mtime past any filesystem's resolution.
    utimesSync(path, new Date(), new Date(Date.now() + 2000));
    expect(await g.verifyLedger()).toBe(res.ledgerEntryId);
  });

  it('keeps only the ref fields, and refuses a malformed ref before any call', async () => {
    const g = gateway();
    await g.complete(req({ profileId: 'demo', prompt: { ...prompt, extra: 'dropped' } as typeof prompt }));
    expect(ledgerLines()[0].prompt).toEqual(prompt);
    const bad: unknown[] = [
      { ...prompt, id: '' },
      { ...prompt, version: 0 },
      { ...prompt, version: 1.5 },
      { ...prompt, hash: 'abc' },
      { ...prompt, fidelity: 'loose' },
      'product.c1.critic',
    ];
    for (const p of bad) {
      await expect(g.complete(req({ profileId: 'demo', prompt: p as typeof prompt }))).rejects.toMatchObject({ code: 'invalid-request', message: expect.stringMatching(/prompt/) });
    }
    expect(ledgerLines()).toHaveLength(1);
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
