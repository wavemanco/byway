// Scratch probe (lens-tests): a Google call whose deadline ran out, but whose error says the provider billed nothing.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import type { GoogleClientLike } from '../src/providers/google.ts';
import { MemoryArtifacts } from './fakes.ts';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => vi.useRealTimers());

it('google text: the deadline ran out as the provider refused with its own 429 body: counted by that error, not as waited', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lens-probe-'));
  let n = 0; let first: () => void = () => {}; const started = new Promise<void>((r) => (first = r));
  const client: GoogleClientLike = {
    models: {
      generateContent(params) {
        n++;
        if (n > 1) return Promise.resolve({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Done.' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } });
        first(); const signal = params.config?.abortSignal;
        return new Promise((_, reject) => signal?.addEventListener('abort', () => reject(Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429, error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED' } })), { once: true }));
      },
    },
  };
  const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts: new MemoryArtifacts(), caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50 }, spendBook: new MemorySpendBook(), env: { GEMINI_API_KEY: '[redacted]' }, clients: { google: client }, retry: { sleep: async () => {}, random: () => 0.5 } });
  const out = g.complete({ workspaceId: 'ws', runId: 'run-1', stepId: 'draft', purpose: 'build:prose', profileId: 'google', tier: 'mid', messages: [{ role: 'user', content: [{ type: 'text', text: 'Write it.' }] }], maxOutputTokens: 1000 }).then((r) => ({ ok: r.text }), (e) => ({ err: (e as Error).message }));
  await started; await vi.advanceTimersByTimeAsync(15 * 60_000); await vi.advanceTimersByTimeAsync(60_000);
  const res = await out;
  const spend = await g.spend('ws');
  console.log('PROBE2', JSON.stringify(res), 'sends', n, JSON.stringify(spend));
  expect(spend.uncertainUsd).toBe(0);
  await g.close();
});
