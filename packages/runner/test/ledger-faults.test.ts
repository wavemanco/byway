/**
 * A ledger line that is JSON, and has a workspace, a sequence number and a cost, but a field the spend book records is
 * missing or of the wrong type (ADR-0095 decision 6), with the real store and its spend book in byway.sqlite. A flipped
 * bit can do it: `"at"` becomes `"au"`. It is an ordinary accounting fault, like any line the book cannot read: paid
 * calls wait until the person acknowledges it, free demo calls go on, and Settings and the start-up report still answer.
 * The provider is a stand-in; nothing leaves this computer.
 */
import { appendFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompletionRequest } from '@byway/contracts';
import { createGateway, Ledger, type LedgerDraft, type PriceRow, type ProviderAdapter } from '@byway/gateway';
import { createStore } from '@byway/store';
import { dataDirReport, reportLines } from '../src/data-check.ts';

const PRICES: PriceRow[] = [{ provider: 'anthropic', model: 'fault-model', inputPerMTok: 0, outputPerMTok: 100, source: 'ledger fault tests' }];
const ENV = { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000' };

const draft = (costUsd: number): LedgerDraft => ({
  workspaceId: 'ws',
  runId: 'run-old',
  stepId: 'write',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'anthropic',
  requestedModel: 'fault-model',
  servedModel: 'fault-model',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 1, outputTokens: 1 },
  costUsd,
  latencyMs: 1,
});

const ask = (over: Partial<CompletionRequest> = {}): CompletionRequest => ({
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'write',
  profileId: 'balanced',
  tier: 'big',
  purpose: 'build:prose',
  model: { provider: 'anthropic', model: 'fault-model' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 100,
  ...over,
});

const temps: string[] = [];
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The second line as a hand edit or a flipped bit leaves it: still JSON, still a cost, but not an entry the book can record. */
const ODD: [string, Record<string, unknown>][] = [
  ['its time missing ("at" became "au")', { at: undefined, au: '2026-10-08T12:00:00.000Z' }],
  ['a served model that is an object', { servedModel: { x: 1 } }],
  ['a step id that is an object', { stepId: { x: 1 } }],
  ['a price basis that is a number', { priceBasis: 7 }],
];

describe('a ledger line the spend book cannot record is an accounting fault (ADR-0095)', () => {
  it.each(ODD)('%s: paid calls wait until it is acknowledged; demo calls, spend, Settings and the start-up report go on', async (_label, change) => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-ledger-fault-'));
    temps.push(dataDir);
    const ledgerPath = path.join(dataDir, 'ledger.jsonl');
    const first = await new Ledger({ path: ledgerPath }).append(draft(0.01));
    const offset = statSync(ledgerPath).size;
    const odd: Record<string, unknown> = { ...first, id: 'odd-1', seq: 2, costUsd: 0.05, ...change };
    for (const k of Object.keys(odd)) if (odd[k] === undefined) delete odd[k];
    appendFileSync(ledgerPath, `${JSON.stringify(odd)}\n`);

    const store = createStore({ dataDir });
    let sent = 0;
    const adapter = {
      id: 'anthropic',
      async complete(req: { model: string }) {
        sent += 1;
        return { text: 'done', servedModel: req.model, usage: { inputTokens: 0, outputTokens: 100 }, requestBody: {}, responseBody: {} };
      },
    } as unknown as ProviderAdapter;
    const common = { ledgerPath, artifacts: store.artifacts, spendBook: store.spendBook, caps: { workspaceCapUsd: () => 1 } };
    const paid = createGateway({ ...common, env: ENV, prices: PRICES, adapters: { anthropic: adapter } });
    const demo = createGateway({ ...common, env: {}, demo: true });
    cleanups.push(async () => {
      await paid.close();
      await demo.close();
      store.close();
    });

    await expect(paid.complete(ask())).rejects.toMatchObject({ code: 'accounting-fault', retryable: false, message: expect.stringContaining(`at byte ${offset}`) });
    expect(sent).toBe(0);
    await expect(demo.complete(ask({ profileId: 'demo', model: undefined }))).resolves.toMatchObject({ provider: 'mock', costUsd: 0 });
    // The line is not counted (that is what acknowledging accepts); the line before it is.
    expect(await paid.spend('ws')).toMatchObject({ spentUsd: 0.01, byRun: { 'run-old': 0.01 }, inFlightUsd: 0, uncertainUsd: 0 });
    const { faults } = await paid.spendRecords('ws');
    expect(faults).toEqual([expect.objectContaining({ detail: expect.stringContaining(`Line at byte ${offset} of ledger.jsonl cannot be read as a spend entry`) })]);
    const report = reportLines(await dataDirReport({ dataDir, store, gateway: paid, workspaceIds: ['ws'] }));
    expect(report.ok).toBe(false);
    expect(report.lines).toContain('1 line of the spend ledger that byway could not read is listed under Spending records in Settings; byway makes no paid call until you acknowledge it there.');

    expect(await store.spendBook.acknowledgeFault(faults[0]!.id)).toBe(true);
    await expect(paid.complete(ask())).resolves.toMatchObject({ provider: 'anthropic' });
    expect(sent).toBe(1);
    expect((await paid.spendRecords('ws')).faults).toEqual([]);
  });
});
