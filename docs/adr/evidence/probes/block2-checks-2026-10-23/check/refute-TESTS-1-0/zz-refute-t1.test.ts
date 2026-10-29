// Scratch probe (refute-TESTS-1-0): the stop lands mid-flight on the clip's result read (listeners attached), and the
// 504 user timeout arrives 20 ms later; also the stop during the status poll after fal dropped the job (cancel completed).
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from '@fal-ai/client';
import { it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import type { FalClientLike } from '../src/providers/fal.ts';
import { fakeFetch, MemoryArtifacts } from './fakes.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const mode of ['midflight', 'no-stop', 'status-window-cancel-completed'] as const) {
  it(`refute probe ${mode}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'refute-t1-'));
    const artifacts = new MemoryArtifacts();
    const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
    const stop = new AbortController();
    const until = new AbortController();
    const cancels: string[] = [];
    let results = 0;
    const client: FalClientLike = {
      storage: { upload: async () => 'https://v3.fal.media/files/up.png' },
      queue: {
        submit: async () => ({ request_id: 'req-1' }),
        subscribeToStatus: async (_e, o) => {
          if (mode === 'status-window-cancel-completed') {
            setTimeout(() => stop.abort(), 5);
            await new Promise((_r, rej) => o.abortSignal?.addEventListener('abort', () => rej(new Error('aborted')), { once: true }));
          }
          return { status: 'COMPLETED' };
        },
        result: async () => {
          results++;
          if (mode === 'midflight') setTimeout(() => stop.abort(), 5);
          await sleep(20);
          throw new ApiError({ message: 'Gateway Timeout', status: 504, body: { detail: 'Request timed out' }, timeoutType: 'user' });
        },
        cancel: async (_e, o) => (cancels.push(o.requestId), { status: 'completed', detail: 'HTTP 400 ALREADY_COMPLETED' }),
      },
    };
    const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts, caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50 }, spendBook: new MemorySpendBook(), env: { FAL_KEY: '[redacted]' }, clients: { fal: client }, fetch: fakeFetch().fetch, retry: { sleep: async () => {}, random: () => 0.5 } });
    const out = await g.video({ workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'p', startFrameArtifactId: startFrame, durationSec: 5, operation: { key: 'run-1/clip/video/abc/1', until: until.signal, cancel: stop.signal, stop: stop.signal } }).then((r) => ({ ok: r.costUsd }), (e) => ({ err: (e as Error).message, billing: (e as { billing?: string }).billing }));
    await sleep(50);
    const ledger = existsSync(join(dir, 'l.jsonl')) ? readFileSync(join(dir, 'l.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).costUsd) : [];
    console.log(`REFUTE ${mode}:`, JSON.stringify(out), 'ledger', JSON.stringify(ledger), 'spend', JSON.stringify(await g.spend('ws')), 'cancels', cancels.length, 'results', results);
    await g.close();
  });
}
