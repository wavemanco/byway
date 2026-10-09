/**
 * The gateway on the spend book (F03, ADR-0095). Admission, the sent mark, settlement, release and abandonment go
 * through the book, which every process on a data directory shares, so:
 * - two gateways (the web process and the worker) respect one cap together;
 * - a call whose caller died counts as "may have been billed" against the workspace only, and one never sent counts
 *   nothing;
 * - a busy or crashed audit file delays its entry, never the call or the caps, and never writes an entry twice;
 * - ledger lines from before the book are counted before any call, once, and a line that cannot be read stops paid
 *   calls until it is acknowledged;
 * - after an attempt that may have been billed, a completion is sent again only with that attempt's bound retained
 *   against the workspace.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayError, type CompletionRequest, type SpendBook } from '@byway/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGateway, type GatewayOptions, type ModelGateway } from '../src/gateway.ts';
import { Ledger, type LedgerDraft } from '../src/ledger.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { PaidCalls } from '../src/paid.ts';
import { PRICES, type PriceRow } from '../src/prices.ts';
import type { ProviderAdapter, ProviderCompletion } from '../src/providers/types.ts';
import { encodePng } from '../src/mock/png.ts';
import { anthropicMessage, fakeAnthropic, fakeFal, fakeFetch, fetchFailed, httpError, MemoryArtifacts } from './fakes.ts';

const KEY = { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000' };
/** claude-opus-5-5 at $100 per million output tokens and nothing for input: 1,000 output tokens are $0.10. */
const PRICED: PriceRow[] = [...PRICES.filter((p) => p.model !== 'claude-opus-5-5'), { provider: 'anthropic', model: 'claude-opus-5-5', inputPerMTok: 0, outputPerMTok: 100, source: 'spend-book tests' }];

let dir: string;
let ledgerPath: string;
let clock: { t: number };
let book: MemorySpendBook;
const caps = { workspace: 0.15, runs: {} as Record<string, number> };
const open: ModelGateway[] = [];

beforeEach(async () => {
  for (const g of open.splice(0)) await g.close();
  dir = mkdtempSync(join(tmpdir(), 'byway-gw-book-'));
  ledgerPath = join(dir, 'ledger.jsonl');
  clock = { t: Date.parse('2026-10-08T12:00:00.000Z') };
  book = new MemorySpendBook({ now: () => new Date(clock.t) });
  caps.workspace = 0.15;
  caps.runs = {};
});

function gateway(over: Partial<GatewayOptions> = {}): ModelGateway {
  const g = createGateway({
    ledgerPath,
    artifacts: new MemoryArtifacts(),
    caps: { workspaceCapUsd: () => caps.workspace, runCapUsd: (id) => caps.runs[id] },
    spendBook: book,
    env: KEY,
    prices: PRICED,
    retry: { sleep: async () => {}, random: () => 0.5 },
    ...over,
  });
  open.push(g);
  return g;
}

const ask = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'draft',
  purpose: 'build:prose',
  profileId: 'balanced',
  tier: 'big',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
  ...over,
});

/** An Anthropic adapter whose calls wait until released, so calls overlap as they do across processes. */
function heldAdapter() {
  const waiting: (() => void)[] = [];
  let calls = 0;
  const adapter: ProviderAdapter = {
    id: 'anthropic',
    async complete(req): Promise<ProviderCompletion> {
      calls++;
      await new Promise<void>((r) => waiting.push(r));
      return { text: 'done', servedModel: req.model, usage: { inputTokens: 10, outputTokens: 1000 }, requestBody: { model: req.model }, responseBody: { ok: true } };
    },
  };
  return { adapter, calls: () => calls, release: () => waiting.splice(0).forEach((r) => r()), waiting: () => waiting.length };
}

const until = async (cond: () => boolean | Promise<boolean>, ms = 5000) => {
  const end = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

const lines = (): Record<string, unknown>[] => (existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : []);

const legacy = (costUsd: number, over: Partial<LedgerDraft> = {}): LedgerDraft => ({
  workspaceId: 'ws',
  runId: 'run-old',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'anthropic',
  requestedModel: 'claude-opus-5-5',
  servedModel: 'claude-opus-5-5',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 1, outputTokens: 1 },
  costUsd,
  latencyMs: 1,
  ...over,
});

describe('two gateways on one spend book (the web process and the worker)', () => {
  it('respect one workspace cap: at $0.15, two $0.10 calls at once make one provider call', async () => {
    const held = heldAdapter();
    const web = gateway({ adapters: { anthropic: held.adapter } });
    const worker = gateway({ adapters: { anthropic: held.adapter } });
    const first = web.complete(ask({ runId: undefined, purpose: 'advisor.intake' }));
    await until(() => held.waiting() === 1);
    const second = await worker.complete(ask()).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(GatewayError);
    expect(second).toMatchObject({ code: 'budget-exceeded', budget: { scope: 'workspace', reservedUsd: 0.1, estimateUsd: 0.1, spentUsd: 0 } });
    held.release();
    await first;
    expect(held.calls()).toBe(1);
    expect((await worker.spend('ws')).spentUsd).toBeCloseTo(0.1, 9);
  });
});

describe('calls whose caller stopped', () => {
  it('a call admitted but never sent counts nothing once its owner is gone', async () => {
    caps.workspace = 0.15;
    const dead = new PaidCalls({ book, ledger: new Ledger({ path: ledgerPath }), warn: () => undefined });
    await dead.admit({ workspaceId: 'ws', runId: 'run-1', purpose: 'build:prose', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: 0.1, paid: true }, async () => ({ workspaceUsd: 0.15 }));
    await dead.close();
    const { client } = fakeAnthropic([anthropicMessage({ usage: { input_tokens: 0, output_tokens: 1000 } })]);
    const g = gateway({ clients: { anthropic: client } });
    await expect(g.complete(ask())).rejects.toMatchObject({ code: 'budget-exceeded' });
    clock.t += 61_000;
    await expect(g.complete(ask())).resolves.toMatchObject({ costUsd: 0.1 });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('a sent call whose owner died may have been billed: it counts against the workspace, not the run, until cleared', async () => {
    caps.workspace = 0.25;
    caps.runs['run-1'] = 0.1;
    const held = heldAdapter();
    const dying = gateway({ adapters: { anthropic: held.adapter } });
    void dying.complete(ask()).catch(() => undefined);
    await until(() => held.waiting() === 1);
    // The worker dies: nothing renews its call any more.
    await dying.close();
    clock.t += 61_000;
    const { client } = fakeAnthropic([anthropicMessage({ usage: { input_tokens: 0, output_tokens: 1000 } })]);
    const restarted = gateway({ clients: { anthropic: client } });
    // The run's cap does not count it: the restarted step is admitted at the run's full $0.10.
    await expect(restarted.complete(ask())).resolves.toMatchObject({ costUsd: 0.1 });
    expect(await restarted.spend('ws')).toMatchObject({ spentUsd: 0.1, byRun: { 'run-1': 0.1 }, uncertainUsd: 0.1 });
    // The workspace's does: $0.10 settled + $0.10 that may have been billed + $0.10 is over $0.25.
    const refused = await restarted.complete(ask({ runId: 'run-2' })).catch((e: unknown) => e);
    expect(refused).toMatchObject({ code: 'budget-exceeded', budget: { scope: 'workspace', uncertainUsd: 0.1 } });
    expect((refused as Error).message).toMatch(/\$0\.1000 that may have been billed/);
    const records = await restarted.spendRecords('ws');
    expect(records.uncertain).toEqual([expect.objectContaining({ reason: 'interrupted', usd: 0.1, runId: 'run-1' })]);
    expect(await book.clearUncertain('ws', records.uncertain.map((u) => u.opId))).toBe(1);
    await expect(restarted.complete(ask({ runId: 'run-2' }))).resolves.toMatchObject({ provider: 'anthropic' });
    held.release();
  });
});

describe('the audit file is written from the book (the outbox)', () => {
  it('with the ledger lock held, a settled call returns its result promptly; the next drain writes its entry, with its id', async () => {
    caps.workspace = 10;
    const { client } = fakeAnthropic();
    const g = gateway({ clients: { anthropic: client }, drainWaitMs: 200, renewEveryMs: 50 });
    writeFileSync(`${ledgerPath}.lock`, '');
    const started = Date.now();
    const res = await g.complete(ask());
    expect(Date.now() - started).toBeLessThan(2000);
    expect((await g.spend('ws')).spentUsd).toBeCloseTo(res.costUsd, 9);
    expect(lines()).toEqual([]);
    expect((await g.spendRecords('ws')).notInAuditFile).toBe(1);
    // The other process lets go; the gateway's timer writes the entry.
    await import('node:fs').then((fs) => fs.rmSync(`${ledgerPath}.lock`));
    await until(() => lines().length === 1);
    expect(lines()[0]).toMatchObject({ id: res.ledgerEntryId, operationId: expect.any(String), costUsd: res.costUsd });
    expect(await g.verifyLedger()).toBeNull();
    expect(await g.auditLedger()).toEqual({ brokenAt: null, missing: [], pending: 0, setAside: [] });
  });

  it('many calls settling while the lock is held each wait for at most two drains, not for every other call’s', async () => {
    caps.workspace = 10;
    const { client } = fakeAnthropic();
    const g = gateway({ clients: { anthropic: client }, drainWaitMs: 150 });
    writeFileSync(`${ledgerPath}.lock`, '');
    const started = Date.now();
    const results = await Promise.all(Array.from({ length: 8 }, () => g.complete(ask())));
    // Eight drains one after another would take at least 8 × 150 ms.
    expect(Date.now() - started).toBeLessThan(900);
    expect(new Set(results.map((r) => r.ledgerEntryId)).size).toBe(8);
    await import('node:fs').then((fs) => fs.rmSync(`${ledgerPath}.lock`));
    await g.close();
    expect(lines().map((l) => l.id).sort()).toEqual(results.map((r) => r.ledgerEntryId).sort());
  });

  it('an entry appended before a crash could mark it is found again, not written twice', async () => {
    caps.workspace = 10;
    const { client } = fakeAnthropic();
    const before = gateway({ clients: { anthropic: client }, drainWaitMs: 50 });
    writeFileSync(`${ledgerPath}.lock`, '');
    const res = await before.complete(ask());
    const [pending] = await book.unledgered(10);
    // The crash: the drain appended the entry, then died before marking it.
    await import('node:fs').then((fs) => fs.rmSync(`${ledgerPath}.lock`));
    await new Ledger({ path: ledgerPath }).exclusive((l) => l.append({ ...pending!.entry, operationId: pending!.opId }, { id: pending!.entryId, at: pending!.at }));
    const ledger = new Ledger({ path: ledgerPath });
    const appended = (await ledger.entries())[0]!;
    expect(appended.operationId).toBe(pending!.opId);
    // The restart reads the file before it drains.
    const after = gateway({ clients: { anthropic: client } });
    expect((await after.spend('ws')).spentUsd).toBeCloseTo(res.costUsd, 9);
    await after.complete(ask());
    await after.close();
    expect(lines().filter((l) => l.operationId === pending!.opId)).toHaveLength(1);
    expect(lines()).toHaveLength(2);
    expect(await book.unledgered(10)).toEqual([]);
  });
});

describe('an existing ledger (spend from before the book)', () => {
  it('is counted before any call, once, however often byway restarts', async () => {
    const ledger = new Ledger({ path: ledgerPath });
    await ledger.append(legacy(0.05));
    await ledger.append(legacy(0.07, { runId: undefined }));
    await ledger.append(legacy(0.5, { workspaceId: 'other' }));
    for (let restart = 0; restart < 3; restart++) {
      const g = gateway();
      expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.12, byRun: { 'run-old': 0.05 } });
      await g.close();
    }
    expect((await book.ledgeredCalls()).length).toBe(3);
  });

  it('read by two gateways at the same time leaves one row per entry', async () => {
    const ledger = new Ledger({ path: ledgerPath });
    for (let i = 0; i < 20; i++) await ledger.append(legacy(0.01));
    const [a, b] = [gateway(), gateway()];
    await Promise.all([a.spend('ws'), b.spend('ws'), a.spend('ws'), b.spend('ws')]);
    expect((await a.spend('ws')).spentUsd).toBeCloseTo(0.2, 9);
    expect((await book.ledgeredCalls()).length).toBe(20);
  });

  it('a line in the middle that cannot be read stops paid calls until acknowledged; demo calls go on', async () => {
    caps.workspace = 10;
    const ledger = new Ledger({ path: ledgerPath });
    await ledger.append(legacy(0.05));
    await ledger.append(legacy(0.05));
    const text = readFileSync(ledgerPath, 'utf8').split('\n');
    text[0] = '{"workspaceId":"ws","costUsd":"lots"}';
    writeFileSync(ledgerPath, text.join('\n'));
    const { client, calls } = fakeAnthropic();
    const g = gateway({ clients: { anthropic: client } });
    const refused = await g.complete(ask()).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(GatewayError);
    expect(refused).toMatchObject({ code: 'accounting-fault', retryable: false });
    expect((refused as Error).message).toMatch(/byte 0.*Settings/);
    expect(calls).toHaveLength(0);
    const demo = gateway({ demo: true });
    await expect(demo.complete(ask({ profileId: 'demo' }))).resolves.toMatchObject({ provider: 'mock', costUsd: 0 });
    const { faults } = await g.spendRecords('ws');
    expect(faults).toEqual([expect.objectContaining({ detail: expect.stringMatching(/byte 0/) })]);
    expect(await book.acknowledgeFault(faults[0]!.id)).toBe(true);
    await expect(g.complete(ask())).resolves.toMatchObject({ provider: 'anthropic' });
  });
});

describe('a completion re-sent after an attempt that may have been billed', () => {
  it('retains the first attempt’s bound on the workspace (not the run), sends once more, and settles the second', async () => {
    caps.workspace = 1;
    caps.runs['run-1'] = 0.25;
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNRESET'), anthropicMessage({ usage: { input_tokens: 0, output_tokens: 800 } })]);
    const g = gateway({ clients: { anthropic: client } });
    const res = await g.complete(ask());
    expect(calls).toHaveLength(2);
    expect(res.costUsd).toBeCloseTo(0.08, 9);
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.08, byRun: { 'run-1': 0.08 }, uncertainUsd: 0.1, inFlightUsd: 0 });
    // The run's cap counts only what was settled: $0.08 + $0.10 fits under $0.25.
    await expect(g.complete(ask())).resolves.toMatchObject({ provider: 'anthropic' });
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'resent', usd: 0.1 })]);
  });

  it('does not send again when the retained bound would break the workspace cap', async () => {
    caps.workspace = 0.15;
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNRESET')]);
    const g = gateway({ clients: { anthropic: client } });
    await expect(g.complete(ask())).rejects.toMatchObject({ code: 'budget-exceeded', budget: { scope: 'workspace', estimateUsd: 0.1 } });
    expect(calls).toHaveLength(1);
    // The attempt may have been billed: it counts until cleared.
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0.1 });
  });

  it('a second attempt that may have been billed ends the call; both attempts count against the workspace', async () => {
    caps.workspace = 1;
    const { client, calls } = fakeAnthropic([fetchFailed('ECONNRESET'), fetchFailed('ECONNRESET')]);
    const g = gateway({ clients: { anthropic: client } });
    await expect(g.complete(ask())).rejects.toMatchObject({ code: 'provider-error' });
    expect(calls).toHaveLength(2);
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, uncertainUsd: 0.2 });
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'failed', usd: 0.2 })]);
  });

  it('a failure that was certainly not billed releases the call', async () => {
    caps.workspace = 1;
    const { client } = fakeAnthropic([fetchFailed('ECONNREFUSED'), fetchFailed('ECONNREFUSED'), fetchFailed('ECONNREFUSED'), fetchFailed('ECONNREFUSED')]);
    const g = gateway({ clients: { anthropic: client } });
    await expect(g.complete(ask())).rejects.toMatchObject({ code: 'provider-error' });
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });
});

describe('provider-reported usage that is not a finite number (ADR-0083’s hand-off)', () => {
  it('is ledgered at the call’s planning figures, flagged assumed, instead of failing the append after billing', async () => {
    caps.workspace = 10;
    const { client } = fakeAnthropic([anthropicMessage({ usage: { input_tokens: 10, output_tokens: Number.POSITIVE_INFINITY } })]);
    const g = gateway({ clients: { anthropic: client } });
    const res = await g.complete(ask());
    expect(res.costUsd).toBeCloseTo(0.1, 9);
    expect(res.usage).toEqual({ inputTokens: 10, outputTokens: 1000 });
    expect(lines()).toEqual([expect.objectContaining({ id: res.ledgerEntryId, priceBasis: 'assumed', usage: { inputTokens: 10, outputTokens: 1000 } })]);
    expect((await g.spend('ws')).spentUsd).toBeCloseTo(0.1, 9);
    expect(await g.verifyLedger()).toBeNull();
  });
});

describe('the gateway needs a spend book', () => {
  it('refuses to start without one: no root can fall back to per-process reservations', () => {
    expect(() => createGateway({ ledgerPath, artifacts: new MemoryArtifacts(), caps: { workspaceCapUsd: () => 1 } } as unknown as GatewayOptions)).toThrow(/spend book/);
  });

  it('close() stops its timer: nothing is renewed or drained afterwards', async () => {
    const spy: string[] = [];
    const watched: SpendBook = new Proxy(book, {
      get(target, prop) {
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? (...args: unknown[]) => (spy.push(String(prop)), (v as (...a: unknown[]) => unknown).apply(target, args)) : v;
      },
    });
    const g = gateway({ spendBook: watched, renewEveryMs: 20 });
    await g.close();
    spy.length = 0;
    await new Promise((r) => setTimeout(r, 120));
    expect(spy).toEqual([]);
  });
});

describe('a fal relay link in the spend book', () => {
  const FAL_KEY = '0d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6:00112233445566778899aabbccddeeff';
  const CLIP_MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';

  async function link(fal: ReturnType<typeof fakeFal>) {
    caps.workspace = 10;
    const artifacts = new MemoryArtifacts();
    const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
    const g = gateway({ env: { FAL_KEY }, prices: PRICES, artifacts, clients: { fal: fal.client }, fetch: fakeFetch().fetch });
    const outcome = await g
      .video({ workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'Shot 1: dawn', startFrameArtifactId: startFrame, durationSec: 5 })
      .catch((e: unknown) => e);
    return { g, outcome };
  }

  it('settles a clip at its seconds, and counts nothing as uncertain', async () => {
    const fal = fakeFal();
    const { g, outcome } = await link(fal);
    expect(outcome).toMatchObject({ provider: 'fal', costUsd: expect.any(Number) });
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0, spentUsd: (outcome as { costUsd: number }).costUsd });
  });

  it('a submission accepted and then reset: one submission, a non-retryable failure, and the clip counted as may have been billed', async () => {
    const fal = fakeFal({ [CLIP_MODEL]: [fetchFailed('ECONNRESET')] });
    const { g, outcome } = await link(fal);
    expect(fal.calls.filter((c) => c.endpoint === CLIP_MODEL)).toHaveLength(1);
    expect(outcome).toMatchObject({ code: 'provider-error', retryable: false });
    const spend = await g.spend('ws');
    expect(spend).toMatchObject({ spentUsd: 0, inFlightUsd: 0 });
    expect(spend.uncertainUsd).toBeGreaterThan(0);
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ provider: 'fal', reason: 'failed', usd: spend.uncertainUsd })]);
  });

  it('a job fal accepted whose status cannot be read is listed with its request id, as may have been billed', async () => {
    const fal = fakeFal({}, { pollFailures: { [CLIP_MODEL]: [httpError(400, 'bad status request')] } });
    const { g, outcome } = await link(fal);
    expect(outcome).toMatchObject({ code: 'provider-error', retryable: false });
    expect((await g.spendRecords('ws')).uncertain).toEqual([expect.objectContaining({ reason: 'failed', providerJobs: { generation: 'req-1' } })]);
  });

  it('a start frame that cannot be uploaded sends nothing billable: the call is released', async () => {
    const fal = fakeFal();
    fal.client.storage.upload = async () => {
      throw httpError(400, 'bad upload');
    };
    const { g, outcome } = await link(fal);
    expect(outcome).toBeInstanceOf(GatewayError);
    expect(fal.calls).toHaveLength(0);
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0 });
  });
});

describe('leases while a call is in progress', () => {
  it('the gateway renews a call it is still waiting on, so a long call stays in flight, not "may have been billed"', async () => {
    caps.workspace = 1;
    const held = heldAdapter();
    const g = gateway({ adapters: { anthropic: held.adapter }, renewEveryMs: 20 });
    const pending = g.complete(ask());
    await until(() => held.waiting() === 1);
    for (let i = 0; i < 4; i++) {
      clock.t += 40_000;
      await new Promise((r) => setTimeout(r, 80));
    }
    expect(await g.spend('ws')).toMatchObject({ inFlightUsd: 0.1, uncertainUsd: 0 });
    held.release();
    await pending;
    expect(await g.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0, uncertainUsd: 0 });
  });

  it('a call whose lease ran out before it was sent (its process slept) is admitted once more, then sent', async () => {
    const calls = new PaidCalls({ book, ledger: new Ledger({ path: ledgerPath }), warn: () => undefined });
    const op = await calls.admit({ workspaceId: 'ws', runId: 'run-1', purpose: 'build:prose', kind: 'completion', provider: 'anthropic', model: 'claude-opus-5-5', reserveUsd: 0.1, paid: true }, async () => ({ workspaceUsd: 1 }));
    const first = op.id;
    clock.t += 61_000;
    await op.markSent();
    expect(op.id).not.toBe(first);
    const { inFlight } = await book.records('ws');
    expect(inFlight.map((c) => c.opId)).toEqual([op.id]);
    await op.end();
    await calls.close();
  });
});
