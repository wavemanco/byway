/**
 * Worker-thread body for the concurrency tests: opens its own store (its own SQLite connection) on the shared data
 * directory, then either appends events and artifacts as fast as it can ('append') or only opens the store and ensures
 * the default workspace ('open'). Loaded through Node's built-in type stripping, so this file and everything it imports
 * must stay erasable TypeScript.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { createStore } from '../../src/index.ts';

export type Job =
  | { mode: 'append'; dataDir: string; runId: string; worker: number; count: number }
  | { mode: 'open'; dataDir: string };

export type Reply = { seqs: number[]; workspaceId: string };

const job = workerData as Job;
const store = createStore({ dataDir: job.dataDir });
try {
  const seqs: number[] = [];
  if (job.mode === 'append') {
    for (let i = 0; i < job.count; i++) {
      seqs.push((await store.appendEvent({ runId: job.runId, type: 'cost', data: { worker: job.worker, i } })).seq);
      if (i % 10 === 0) await store.artifacts.putText(`shared artifact ${i}`, 'text/plain');
    }
  }
  const workspace = await store.ensureDefaultWorkspace();
  const reply: Reply = { seqs, workspaceId: workspace.id };
  parentPort?.postMessage(reply);
} finally {
  store.close();
}
