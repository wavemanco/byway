/**
 * The local engine (spec §2 process model): a Temporal dev server persisted in `<dataDir>/temporal.sqlite`, the
 * worker (built with esbuild, ADR-0070) in the same process, and a Runner for another process via connectRunner.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DefaultLogger, Runtime } from '@temporalio/worker';
import { createGateway } from '@byway/gateway';
import { storeCaps } from '../src/caps.ts';
import { connectRunner, startDevEngine, TEMPORAL_DB_FILENAME, type DevEngine } from '../src/dev-engine.ts';
import { workflowIdFor } from '../src/types.ts';
import { fakePages } from './helpers/fake-pages.ts';
import { fakePrompts } from './helpers/fake-prompts.ts';
import { createTestStore } from './helpers/memo.ts';
import { PROBLEM } from './helpers/harness.ts';
import { tiny } from './helpers/recipes.ts';

try {
  Runtime.install({ logger: new DefaultLogger('ERROR') });
} catch {
  // Installed already.
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });

const dir = mkdtempSync(path.join(tmpdir(), 'byway-engine-'));
const store = createTestStore({ dataDir: dir });
const gateway = createGateway({ ledgerPath: path.join(dir, 'ledger.jsonl'), artifacts: store.artifacts, caps: storeCaps(store), demo: true, env: {} });
let engine: DevEngine | undefined;

afterAll(async () => {
  await engine?.stop();
  store.close();
  rmSync(dir, { recursive: true, force: true });
}, 60_000);

describe('the dev engine', () => {
  it('runs a recipe end to end, and keeps its history in the data directory across restarts', async () => {
    const port = await freePort();
    engine = await startDevEngine({ dataDir: dir, gateway, store, prompts: fakePrompts(), port, pages: fakePages() });
    expect(engine.address).toBe(`127.0.0.1:${port}`);
    expect(existsSync(path.join(dir, TEMPORAL_DB_FILENAME))).toBe(true);

    // The app is another process: it talks to the engine through its own client.
    const app = await connectRunner({ store, address: engine.address });
    const ws = await store.ensureDefaultWorkspace();
    const run = await app.runner.start({ workspaceId: ws.id, recipe: tiny, problem: PROBLEM, profileId: 'demo', budgetUsd: 5 });
    for (;;) {
      const view = await app.runner.view(run.id);
      const open = view.checkpoints.find((c) => c.status === 'open');
      if (open) await app.runner.resolve({ checkpointId: open.id, text: 'Good.' });
      if (view.run.status === 'done') break;
      await new Promise((r) => setTimeout(r, 25));
    }
    // "done" is written just before the workflow returns; let it return before the engine stops.
    expect(await engine.client.workflow.getHandle(workflowIdFor(run.id)).result()).toMatchObject({ status: 'done' });
    await app.close();
    await engine.stop();

    // Restarted on the same data directory, the server still knows the finished workflow.
    engine = await startDevEngine({ dataDir: dir, gateway, store, prompts: fakePrompts(), port, pages: fakePages() });
    const described = await engine.client.workflow.getHandle(workflowIdFor(run.id)).describe();
    expect(described.status.name).toBe('COMPLETED');
  }, 120_000);
});
