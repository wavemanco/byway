import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import type { Job, Reply } from './fixtures/append-worker.ts';
import { openStore, seedRun, tempDir } from './helpers.ts';

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

/** Runs the worker fixture on its own thread, which has its own SQLite connection: real lock contention. */
function runWorker(job: Job): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./fixtures/append-worker.ts', import.meta.url), { workerData: job });
    let reply: Reply | undefined;
    w.once('message', (m: Reply) => (reply = m));
    w.once('error', reject);
    w.once('exit', (code) => (code === 0 && reply ? resolve(reply) : reject(new Error(`worker exited with ${code}`))));
  });
}

/** Waits for every worker (so none still holds the file when the temp folder is removed), then fails on the first error. */
async function runWorkers(jobs: Job[]): Promise<Reply[]> {
  const settled = await Promise.allSettled(jobs.map(runWorker));
  const failed = settled.find((s) => s.status === 'rejected');
  if (failed) throw failed.reason;
  return settled.map((s) => (s as PromiseFulfilledResult<Reply>).value);
}

describe('concurrent store instances on one file', () => {
  it('interleaved appends from two instances in one process share one gap-free sequence', async () => {
    const dataDir = tempDir();
    const a = openStore({ dataDir });
    const b = openStore({ dataDir });
    await seedRun(a, 'run');
    const appended = await Promise.all(range(100).map((i) => (i % 2 ? a : b).appendEvent({ runId: 'run', type: 'cost', data: { i } })));
    expect(appended.map((e) => e.seq).sort((x, y) => x - y)).toEqual(range(100));
    expect((await b.events('run')).map((e) => e.seq)).toEqual(range(100));
  });

  it('parallel writers on separate threads get unique, gap-free seqs', async () => {
    const dataDir = tempDir();
    const store = openStore({ dataDir });
    await seedRun(store, 'run');
    const workers = 4;
    const count = 60;
    const replies = await runWorkers(range(workers).map((worker): Job => ({ mode: 'append', dataDir, runId: 'run', worker, count })));
    for (const { seqs } of replies) expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(replies.flatMap((r) => r.seqs).sort((x, y) => x - y)).toEqual(range(workers * count));
    expect((await store.events('run')).map((e) => e.seq)).toEqual(range(workers * count));
    expect(new Set(replies.map((r) => r.workspaceId)).size).toBe(1);
  }, 60_000);

  it('parallel writers on separate threads retrying the same keyed appends insert each key once', async () => {
    const dataDir = tempDir();
    const store = openStore({ dataDir });
    await seedRun(store, 'run');
    const count = 40;
    const replies = await runWorkers(range(4).map((worker): Job => ({ mode: 'append', dataDir, runId: 'run', worker, count, dedupe: true })));
    // Every worker reaches key k<i> only after k<i-1> exists, so k<i> is always seq i+1, whoever inserted it.
    for (const { seqs } of replies) expect(seqs).toEqual(range(count));
    const events = await store.events('run');
    expect(events.map((e) => e.seq)).toEqual(range(count));
    expect(events.map((e) => e.data.i)).toEqual(range(count).map((n) => n - 1));
  }, 60_000);

  it('threads opening a fresh data directory at once migrate it once and agree on one default workspace', async () => {
    const dataDir = tempDir();
    const replies = await runWorkers(range(8).map((): Job => ({ mode: 'open', dataDir })));
    expect(new Set(replies.map((r) => r.workspaceId)).size).toBe(1);
    const store = openStore({ dataDir });
    expect((await store.ensureDefaultWorkspace()).id).toBe(replies[0]?.workspaceId);
  }, 60_000);
});
