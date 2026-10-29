// Scratch probe (lens-tests): a clip fal dropped at its start deadline, with the run's stop arriving as its result is read.
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError } from '@fal-ai/client';
import { expect, it } from 'vitest';
import { createGateway } from '../src/gateway.ts';
import { MemorySpendBook } from '../src/memory-book.ts';
import { encodePng } from '../src/mock/png.ts';
import type { FalClientLike } from '../src/providers/fal.ts';
import { fakeFetch, MemoryArtifacts } from './fakes.ts';

for (const when of ['before', 'after'] as const) {
  it(`stop ${when} the 504 arrives`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lens-probe-'));
    const artifacts = new MemoryArtifacts();
    const startFrame = (await artifacts.put(encodePng(4, 2, new Uint8Array(24).fill(200)), 'image/png')).id;
    const stop = new AbortController();
    const until = new AbortController();
    const cancels: string[] = [];
    const client: FalClientLike = {
      storage: { upload: async () => 'https://v3.fal.media/files/up.png' },
      queue: {
        submit: async () => ({ request_id: 'req-1' }),
        subscribeToStatus: async () => ({ status: 'COMPLETED' }),
        result: async () => {
          if (when === 'before') stop.abort();
          await new Promise((r) => setImmediate(r));
          if (when === 'after') setImmediate(() => stop.abort());
          throw new ApiError({ message: 'Gateway Timeout', status: 504, body: { detail: 'Request timed out' }, timeoutType: 'user' });
        },
        cancel: async (_e, o) => (cancels.push(o.requestId), { status: 'failed', detail: 'x' }),
      },
    };
    const g = createGateway({ ledgerPath: join(dir, 'l.jsonl'), artifacts, caps: { workspaceCapUsd: () => 100, runCapUsd: () => 50 }, spendBook: new MemorySpendBook(), env: { FAL_KEY: '[redacted]' }, clients: { fal: client }, fetch: fakeFetch().fetch, retry: { sleep: async () => {}, random: () => 0.5 } });
    const out = await g.video({ workspaceId: 'ws', runId: 'run-1', stepId: 'clip', purpose: 'relay:media', profileId: 'balanced', prompt: 'p', startFrameArtifactId: startFrame, durationSec: 5, operation: { key: 'run-1/clip/video/abc/1', until: until.signal, cancel: stop.signal, stop: stop.signal } }).then((r) => ({ ok: r.costUsd }), (e) => ({ err: (e as Error).message, billing: (e as { billing?: string }).billing }));
    const ledger = existsSync(join(dir, 'l.jsonl')) ? readFileSync(join(dir, 'l.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).costUsd) : [];
    console.log(`PROBE3 stop ${when}:`, JSON.stringify(out), 'ledger', JSON.stringify(ledger), 'spend', JSON.stringify(await g.spend('ws')), 'cancels', cancels.length);
    await g.close();
  });
}
