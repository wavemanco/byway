/**
 * One refusal rule for every provider (ADR-0102, the owner's decision D1, option 2b):
 * - no provider may answer with another model than the one asked for: no server-side fallback, no option to ask for one;
 * - a decline gets one retry on the same model, as a separate paid call (admitted against the caps, ledgered, and
 *   recorded as a retry of the declined call), then a plain failure, for completions and images alike.
 */
import { readdirSync, readFileSync, statSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { GatewayError, type AdmitRequest, type CompletionRequest, type ImageRequest, type SpendContext } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions } from '../src/gateway.ts';
import { memorySpendBook } from '../src/memory-book.ts';
import type { AnthropicMessageLike } from '../src/providers/anthropic.ts';
import { anthropicMessage, fakeAnthropic, fakeGoogle, fakeOpenAI, httpError, MemoryArtifacts } from './fakes.ts';

const KEYS = {
  ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000',
  OPENAI_API_KEY: 'sk-test-not-a-real-openai-key-0000000',
  GEMINI_API_KEY: 'AIza-test-not-real-0000000000000',
  OPENROUTER_API_KEY: 'sk-or-v1-test-not-real-000000',
};

let dir: string;
let artifacts: MemoryArtifacts;
let caps: { workspace: number; runs: Record<string, number> };
let admitted: AdmitRequest[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-declines-'));
  artifacts = new MemoryArtifacts();
  caps = { workspace: 100, runs: {} };
  admitted = [];
});

function gateway(over: Partial<GatewayOptions> = {}) {
  const book = memorySpendBook();
  const admit = book.admit.bind(book);
  book.admit = async (req) => {
    admitted.push(req);
    return admit(req);
  };
  return createGateway({
    ledgerPath: join(dir, 'ledger.jsonl'),
    spendBook: book,
    artifacts,
    caps: { workspaceCapUsd: () => caps.workspace, runCapUsd: (id) => caps.runs[id] },
    env: KEYS,
    retry: { sleep: async () => {}, random: () => 0.5 },
    now: () => new Date('2026-10-16T12:00:00Z'),
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

const imageReq = (over: Partial<ImageRequest> = {}): ImageRequest => ({
  workspaceId: 'ws-1',
  runId: 'run-1',
  stepId: 'asset',
  purpose: 'asset:web-page',
  profileId: 'balanced',
  prompt: 'A loaf of sourdough on linen',
  size: '1024x1024',
  ...over,
});

const ledgerLines = () =>
  readFileSync(join(dir, 'ledger.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l) as Record<string, unknown>);

/** Claude Opus 5.5 declining: 1,000 input tokens at $4 per million, so $0.004 an attempt. */
const declined = (category: string | null = 'cyber', usage: AnthropicMessageLike['usage'] = { input_tokens: 1000, output_tokens: 0 }) =>
  anthropicMessage({ stop_reason: 'refusal', stop_details: { category }, content: [], usage });

const TODO = 'Rephrase the request, or choose another model profile in Settings, then try again.';

describe('no model substitution, everywhere (ADR-0102)', () => {
  it('the gateway has no switch that turns a server-side fallback on', () => {
    // @ts-expect-error GatewayOptions.anthropicRefusalFallback is gone: no entry point can ask for a fallback model.
    const g = gateway({ anthropicRefusalFallback: true });
    expect(g).toBeDefined();
  });

  it('a Claude call asks for no fallback model: no fallback beta, no fallbacks field', async () => {
    const { client, calls } = fakeAnthropic();
    await gateway({ clients: { anthropic: client } }).complete(req());
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toHaveProperty('betas');
    expect(calls[0]).not.toHaveProperty('fallbacks');
  });

  it('no source in the product asks any provider for a fallback model', () => {
    const repo = join(import.meta.dirname, '..', '..', '..');
    const roots = ['packages', join('apps', 'web', 'src'), join('apps', 'web', 'app'), 'scripts'].map((r) => join(repo, r));
    const files: string[] = [];
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (name === 'node_modules' || name === 'test' || name.startsWith('.')) continue;
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx|mts)$/.test(name)) files.push(p);
      }
    };
    for (const r of roots) walk(r);
    expect(files.length).toBeGreaterThan(50);
    const ASKS = [/server-side-fallback-\d{4}/, /\bfallbacks\s*:\s*['"`]/, /allow_fallbacks\s*:\s*true/, /\banthropicRefusalFallback\b/, /\brefusalFallback\b/];
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      return ASKS.filter((re) => re.test(text)).map((re) => `${relative(repo, f)}: ${re.source}`);
    });
    expect(hits).toEqual([]);
  });
});

describe('a decline gets one retry on the same model, then a plain failure (ADR-0102)', () => {
  it('Anthropic: asks once more with the same request; the answer is used, and both calls are ledgered, the second as a retry of the first', async () => {
    const { client, calls } = fakeAnthropic([declined('cyber')]);
    const res = await gateway({ clients: { anthropic: client } }).complete(req());
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(res.text).toBe('- Tighten the hero.\nScore: 6/10');
    const [first, second] = ledgerLines();
    expect(first).toMatchObject({ requestedModel: 'claude-opus-5-5', servedModel: 'claude-opus-5-5', declined: { reason: 'cyber' }, costUsd: 0.004 });
    expect(first).not.toHaveProperty('retryOf');
    expect(second).toMatchObject({ requestedModel: 'claude-opus-5-5', servedModel: 'claude-opus-5-5', retryOf: first!.id });
    expect(second).not.toHaveProperty('declined');
    // The answer's entry; its cost includes the declined attempt, which was billed too.
    expect(res.ledgerEntryId).toBe(second!.id);
    expect(res.costUsd).toBeCloseTo(0.004 + (second!.costUsd as number), 9);
    expect(res.declined).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      purpose: 'critic:web-page',
      kind: 'completion',
      reason: 'cyber',
      ledgerEntryId: first!.id,
      costUsd: 0.004,
      retry: 'answered',
      retryLedgerEntryId: second!.id,
      retryCostUsd: second!.costUsd,
    });
  });

  it('a second decline is a plain failure, not retryable: what happened, that both attempts were billed, and what to do', async () => {
    const { client, calls } = fakeAnthropic([declined('cyber'), declined('cyber'), anthropicMessage()]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.message).toBe(`Anthropic’s model claude-opus-5-5 declined this request (reason given: cyber). byway asked it once more, and it declined again. Both attempts were billed: $0.0080 in all. ${TODO}`);
    expect(calls).toHaveLength(2);
    const [first, second] = ledgerLines();
    expect(second).toMatchObject({ declined: { reason: 'cyber' }, retryOf: first!.id });
    expect(err.declined).toMatchObject({ retry: 'declined', reason: 'cyber', ledgerEntryId: first!.id, costUsd: 0.004, retryLedgerEntryId: second!.id, retryCostUsd: 0.004 });
  });

  it('says so when the provider gave no reason', async () => {
    const { client } = fakeAnthropic([declined(null), declined(null)]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err.message).toMatch(/^Anthropic’s model claude-opus-5-5 declined this request \(no reason given\)\. byway asked it once more/);
    expect(ledgerLines()[0]).toMatchObject({ declined: {} });
    expect(err.declined).not.toHaveProperty('reason');
  });

  it('OpenAI, Google and OpenRouter completions: the same rule, on the same model', async () => {
    const openai = fakeOpenAI([{ model: 'gpt-6-astra', choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I cannot help with that.' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }]);
    const google = fakeGoogle([{ modelVersion: 'gemini-3.1-pro-preview', candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }], usageMetadata: { promptTokenCount: 100 } }]);
    const openrouter = fakeOpenAI([{ model: 'anthropic/claude-opus-5.5', choices: [{ finish_reason: 'content_filter', message: { content: '' } }], usage: { prompt_tokens: 100, completion_tokens: 0, cost: 0.0004 } }]);
    const g = gateway({ clients: { openai: openai.client, google: google.client, openrouter: openrouter.client } });
    const a = await g.complete(req({ profileId: 'openai' }));
    expect(a.declined).toMatchObject({ provider: 'openai', model: 'gpt-6-astra', reason: 'I cannot help with that.', retry: 'answered' });
    expect(openai.calls.map((c) => c.model)).toEqual(['gpt-6-astra', 'gpt-6-astra']);
    const b = await g.complete(req({ profileId: 'google' }));
    expect(b.declined).toMatchObject({ provider: 'google', model: 'gemini-3.1-pro-preview', reason: 'SAFETY', retry: 'answered' });
    expect(google.calls.map((c) => c.model)).toEqual(['gemini-3.1-pro-preview', 'gemini-3.1-pro-preview']);
    const c = await g.complete(req({ profileId: 'openrouter' }));
    expect(c.declined).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-opus-5.5', reason: 'content filter', retry: 'answered', costUsd: 0.0004 });
    expect(openrouter.calls.map((x) => [x.model, x.provider])).toEqual([
      ['anthropic/claude-opus-5.5', { only: ['anthropic'], allow_fallbacks: false }],
      ['anthropic/claude-opus-5.5', { only: ['anthropic'], allow_fallbacks: false }],
    ]);
    expect(ledgerLines().map((e) => [e.provider, e.declined !== undefined, e.retryOf !== undefined])).toEqual([
      ['openai', true, false],
      ['openai', false, true],
      ['google', true, false],
      ['google', false, true],
      ['openrouter', true, false],
      ['openrouter', false, true],
    ]);
  });

  it('images: Google’s safety stop and OpenAI’s moderation block get one retry on the same model', async () => {
    const google = fakeGoogle([{ modelVersion: 'gemini-nano-banana-2.1', candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }], usageMetadata: { promptTokenCount: 30 } }]);
    const openai = fakeOpenAI();
    let blocked = 1;
    const generate = openai.client.images.generate.bind(openai.client.images);
    openai.client.images.generate = async (body) => {
      if (blocked-- > 0) {
        openai.calls.push(body as unknown as Record<string, unknown>);
        throw Object.assign(new Error('400 Your request was rejected by the safety system.'), { status: 400, code: 'moderation_blocked', error: { code: 'moderation_blocked', message: 'rejected' } });
      }
      return generate(body);
    };
    const g = gateway({ clients: { google: google.client, openai: openai.client } });
    const a = await g.image(imageReq());
    expect(a.declined).toMatchObject({ provider: 'google', kind: 'image', reason: 'IMAGE_SAFETY', retry: 'answered' });
    expect(google.calls).toHaveLength(2);
    const b = await g.image(imageReq({ profileId: 'best' }));
    expect(b.declined).toMatchObject({ provider: 'openai', model: 'gpt-image-2.5-sunburst', kind: 'image', reason: 'moderation_blocked', retry: 'answered', costUsd: 0 });
    expect(openai.calls).toHaveLength(2);
    const lines = ledgerLines();
    expect(lines.map((e) => [e.provider, e.kind, e.declined !== undefined, e.retryOf !== undefined])).toEqual([
      ['google', 'image', true, false],
      ['google', 'image', false, true],
      ['openai', 'image', true, false],
      ['openai', 'image', false, true],
    ]);
    // The blocked request reported no usage: it is recorded at no cost.
    expect(lines[2]).toMatchObject({ costUsd: 0, usage: { inputTokens: 0, outputTokens: 0, units: 0 } });
  });

  it('an image declined twice: a plain failure that names the image', async () => {
    const stop = { modelVersion: 'gemini-nano-banana-2.1', candidates: [{ finishReason: 'IMAGE_SAFETY', content: { parts: [] } }], usageMetadata: { promptTokenCount: 1000 } };
    const google = fakeGoogle([stop, stop]);
    const err = (await gateway({ clients: { google: google.client } }).image(imageReq()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.message).toBe(`Google’s model gemini-nano-banana-2.1 declined this image (reason given: IMAGE_SAFETY). byway asked it once more, and it declined again. Both attempts were billed: $0.0030 in all. ${TODO}`);
    expect(err.declined).toMatchObject({ kind: 'image', retry: 'declined' });
    expect(google.calls).toHaveLength(2);
  });

  it('an answer with no image that is not a decline is not asked again (ENG-5 stands)', async () => {
    const google = fakeGoogle([{ modelVersion: 'gemini-nano-banana-2.1', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'A loaf, described.' }] } }] }]);
    const err = (await gateway({ clients: { google: google.client } }).image(imageReq()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.declined).toBeUndefined();
    expect(google.calls).toHaveLength(1);
  });

  it('the retry is admitted against the caps: when a budget has no room for it, it is not made, and the decline is final (not a budget question)', async () => {
    // The decline costs $0.024 (1,000 in, 1,000 out); the call is estimated at about $0.02, so a second one passes $0.03.
    caps.runs['run-1'] = 0.03;
    const { client, calls } = fakeAnthropic([declined('cyber', { input_tokens: 1000, output_tokens: 1000 })]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.budget).toBeUndefined();
    expect(err.message).toMatch(
      /^Anthropic’s model claude-opus-5-5 declined this request \(reason given: cyber\)\. byway did not ask it again: another attempt \(estimated at \$0\.02\d\d\) would take the run over its budget of \$0\.03\. The declined attempt was billed: \$0\.0240\. Rephrase the request, or choose another model profile in Settings, then start again with a larger budget\.$/,
    );
    expect(err.declined).toMatchObject({ retry: 'not-made', costUsd: 0.024 });
    expect(calls).toHaveLength(1);
    expect(ledgerLines()).toHaveLength(1);
    expect(admitted).toHaveLength(2);
  });

  it('the workspace budget says so, and says where to raise it', async () => {
    caps.workspace = 0.03;
    const { client } = fakeAnthropic([declined('cyber', { input_tokens: 1000, output_tokens: 1000 })]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req({ runId: undefined, stepId: undefined, purpose: 'advisor.intake' })).catch((e: unknown) => e)) as GatewayError;
    expect(err.message).toMatch(/byway did not ask it again: another attempt \(estimated at \$0\.02\d\d\) would take your spending over the workspace budget of \$0\.03\./);
    expect(err.message).toMatch(/Rephrase the request, or choose another model profile in Settings, or raise the workspace budget in Settings, then try again\.$/);
  });

  it('a step’s retry has an operation key of its own, made from the step’s key and the declined call’s entry, never a rebuy', async () => {
    const until = new AbortController();
    const operation: NonNullable<SpendContext['operation']> = { key: 'run-1/run-1/critic/-/1/complete/abc/1', until: until.signal, rebuy: true };
    const { client } = fakeAnthropic([declined('cyber')]);
    const res = await gateway({ clients: { anthropic: client } }).complete(req({ operation }));
    expect(admitted.map((a) => [a.operationKey, a.rebuy])).toEqual([
      [operation.key, true],
      [`${operation.key}/after-decline/${res.declined!.ledgerEntryId}`, undefined],
    ]);
    until.abort();
  });

  it('a call without a key (the advisor’s) retries without one', async () => {
    const { client } = fakeAnthropic([declined('cyber')]);
    await gateway({ clients: { anthropic: client } }).complete(req({ runId: undefined, stepId: undefined, purpose: 'advisor.intake' }));
    expect(admitted.map((a) => a.operationKey)).toEqual([undefined, undefined]);
  });

  it('makes no retry once the caller was cancelled', async () => {
    const until = new AbortController();
    const cancel = new AbortController();
    const { client, calls } = fakeAnthropic([
      () => {
        cancel.abort();
        return declined('cyber');
      },
    ]);
    const err = (await gateway({ clients: { anthropic: client } })
      .complete(req({ operation: { key: 'k', until: until.signal, cancel: cancel.signal } }))
      .catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.declined).toMatchObject({ retry: 'not-made', problem: 'the step was stopped' });
    expect(calls).toHaveLength(1);
    until.abort();
  });

  it('a retry that fails ends the call for good: no third ask, and not retryable', async () => {
    const overloaded = () => httpError(529, '529 overloaded', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    const { client, calls } = fakeAnthropic([declined('cyber'), overloaded(), overloaded(), overloaded(), overloaded()]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req()).catch((e: unknown) => e)) as GatewayError;
    expect(err).toMatchObject({ code: 'refused', retryable: false });
    expect(err.message).toMatch(/^Anthropic’s model claude-opus-5-5 declined this request \(reason given: cyber\)\. byway asked it once more, but that attempt failed: anthropic returned 529: 529 overloaded\. The declined attempt was billed: \$0\.0040\. Rephrase/);
    expect(err.declined).toMatchObject({ retry: 'failed' });
    // The declined call, then the retry's four transport attempts (the gateway's own retry policy), and nothing more.
    expect(calls).toHaveLength(5);
  });

  it('a reason that holds a key or text with no canonical form reaches the ledger redacted and well formed', async () => {
    const { client } = fakeAnthropic([declined(`policy ${KEYS.ANTHROPIC_API_KEY} \ud800`), declined('cyber')]);
    const err = (await gateway({ clients: { anthropic: client } }).complete(req()).catch((e: unknown) => e)) as GatewayError;
    const text = readFileSync(join(dir, 'ledger.jsonl'), 'utf8');
    expect(text).not.toContain(KEYS.ANTHROPIC_API_KEY);
    expect(ledgerLines()[0]).toMatchObject({ declined: { reason: 'policy [redacted] �' } });
    expect(err.message).not.toContain(KEYS.ANTHROPIC_API_KEY);
  });
});
