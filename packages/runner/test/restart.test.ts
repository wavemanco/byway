/**
 * A worker stops while a run's paid call is in flight, and a new worker retries the step at once, as Temporal retries
 * an activity on a restarted worker (ADR-0095 decision 3). The real store and its spend book in byway.sqlite, shut down
 * in scripts/serve.ts's order: gateway.close(), then store.close(). The provider is a stand-in; nothing leaves this
 * computer.
 * - A clean stop hands the stopped worker's calls back at once: a call it had sent may have been billed and counts
 *   against the workspace only, so the retry under the run's budget is admitted without a budget question.
 * - A crashed worker hands nothing back: its sent call counts against the run as in flight until its lease runs out
 *   (up to 60 s), and only then against the workspace only.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CompletionRequest } from '@byway/contracts';
import { createGateway, type ProviderAdapter, type PriceRow } from '@byway/gateway';
import { createStore } from '@byway/store';

/** $100 per million output tokens: a 1,000-token allowance is reserved at $0.10. */
const PRICES: PriceRow[] = [{ provider: 'anthropic', model: 'restart-model', inputPerMTok: 0, outputPerMTok: 100, source: 'restart tests' }];
const ENV = { ANTHROPIC_API_KEY: 'sk-ant-api03-test-not-a-real-key-000000' };
/** The run's budget holds one call ($0.10) and not two; the workspace's holds a little more than two. */
const RUN_CAP = 0.15;
const WORKSPACE_CAP = 0.25;

const ask: CompletionRequest = {
  workspaceId: 'ws',
  runId: 'run-1',
  stepId: 'seed',
  profileId: 'balanced',
  tier: 'big',
  purpose: 'build:prose',
  model: { provider: 'anthropic', model: 'restart-model' },
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }],
  maxOutputTokens: 1000,
};

/** A provider that never answers: the call stays in flight until its worker stops. */
function hanging() {
  let sent = 0;
  const adapter = {
    id: 'anthropic',
    async complete() {
      sent += 1;
      await new Promise(() => undefined);
    },
  } as unknown as ProviderAdapter;
  return { adapter, sent: () => sent };
}

const answering = {
  id: 'anthropic',
  async complete(req: { model: string }) {
    return { text: 'done', servedModel: req.model, usage: { inputTokens: 0, outputTokens: 1000 }, requestBody: {}, responseBody: {} };
  },
} as unknown as ProviderAdapter;

const temps: string[] = [];
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** One worker on the data directory: its store and its gateway, with a clock the test moves. */
function worker(dataDir: string, clock: { t: number }, adapter: ProviderAdapter, over: { renewEveryMs?: number } = {}) {
  const store = createStore({ dataDir, now: () => new Date(clock.t) });
  const gateway = createGateway({
    ledgerPath: path.join(dataDir, 'ledger.jsonl'),
    artifacts: store.artifacts,
    spendBook: store.spendBook,
    caps: { workspaceCapUsd: () => WORKSPACE_CAP, runCapUsd: () => RUN_CAP },
    env: ENV,
    prices: PRICES,
    adapters: { anthropic: adapter },
    ...over,
  });
  return { store, gateway };
}

const until = async (cond: () => boolean) => {
  const end = Date.now() + 5000;
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('a worker stopped mid-call, and its step retried on a new worker (ADR-0095)', () => {
  it('after a clean stop the retry is admitted under the run’s budget at once; the stopped call counts against the workspace only', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-restart-'));
    temps.push(dataDir);
    const clock = { t: Date.parse('2026-10-08T12:00:00.000Z') };

    const provider = hanging();
    const old = worker(dataDir, clock, provider.adapter);
    void old.gateway.complete(ask).catch(() => undefined);
    await until(() => provider.sent() === 1);
    // The clean stop, in scripts/serve.ts's order.
    await old.gateway.close();
    old.store.close();

    // A few seconds later, well inside the old call's 60 s lease, Temporal retries the step on the new worker.
    clock.t += 3000;
    const next = worker(dataDir, clock, answering);
    cleanups.push(async () => {
      await next.gateway.close();
      next.store.close();
    });
    expect(await next.gateway.spend('ws')).toMatchObject({ spentUsd: 0, inFlightUsd: 0, uncertainUsd: 0.1 });
    await expect(next.gateway.complete(ask)).resolves.toMatchObject({ costUsd: 0.1 });
    expect(await next.gateway.spend('ws')).toMatchObject({ spentUsd: 0.1, byRun: { 'run-1': 0.1 }, inFlightUsd: 0, uncertainUsd: 0.1 });
    const { uncertain } = await next.gateway.spendRecords('ws');
    expect(uncertain).toEqual([expect.objectContaining({ runId: 'run-1', usd: 0.1, reason: 'interrupted' })]);
    // The workspace's budget still counts it: $0.10 settled + $0.10 that may have been billed + $0.10 is over $0.25.
    await expect(next.gateway.complete({ ...ask, runId: 'run-2' })).rejects.toMatchObject({ code: 'budget-exceeded', budget: { scope: 'workspace', uncertainUsd: 0.1 } });
  });

  it('after a crash the stopped call counts against the run until its lease runs out, then against the workspace only', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'byway-crash-'));
    temps.push(dataDir);
    const clock = { t: Date.parse('2026-10-08T12:00:00.000Z') };

    const provider = hanging();
    // A crashed worker renews nothing and ends nothing: its timer never fires again and close() is never reached.
    const crashed = worker(dataDir, clock, provider.adapter, { renewEveryMs: 3_600_000 });
    void crashed.gateway.complete(ask).catch(() => undefined);
    await until(() => provider.sent() === 1);
    cleanups.push(async () => {
      await crashed.gateway.close();
      crashed.store.close();
    });

    clock.t += 3000;
    const next = worker(dataDir, clock, answering);
    cleanups.unshift(async () => {
      await next.gateway.close();
      next.store.close();
    });
    expect(await next.gateway.spend('ws')).toMatchObject({ inFlightUsd: 0.1, uncertainUsd: 0 });
    await expect(next.gateway.complete(ask)).rejects.toMatchObject({ code: 'budget-exceeded', budget: { scope: 'run', reservedUsd: 0.1 } });
    // Its lease (60 s from when it was last renewed) runs out.
    clock.t += 58_000;
    expect(await next.gateway.spend('ws')).toMatchObject({ inFlightUsd: 0, uncertainUsd: 0.1 });
    await expect(next.gateway.complete(ask)).resolves.toMatchObject({ costUsd: 0.1 });
  });
});
