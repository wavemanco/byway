import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createStore } from '@byway/store';
import { LOST_RUN_MESSAGE, settleLostRun } from '../src/lost-runs.ts';

describe('probe: the repeated lost-run pass and a Cancel on the same lost run, from two processes', () => {
  it('can end the run with two terminal events and the pass\'s status over the person\'s Cancel', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'byway-race-'));
    // Two connections on one data directory: the web app's (Cancel) and the worker's (the pass).
    const web = createStore({ dataDir });
    const worker = createStore({ dataDir });
    const ws = await web.ensureDefaultWorkspace();
    await web.createRun({ id: 'run-1', workspaceId: ws.id, recipeId: 'c1', recipeHash: `sha256:${'a'.repeat(64)}`, profileId: 'demo', title: 'T', problem: 'P', medium: 'prose', budgetUsd: 5, status: 'running' });
    // Runner.cancel found no workflow (WorkflowNotFoundError) and settles the run as cancelled; the pass, which found the
    // workflow closed, settles it as failed. Both read the run before either writes it.
    const [cancelled, failed] = await Promise.all([settleLostRun(web, 'run-1', { status: 'cancelled' }), settleLostRun(worker, 'run-1', { status: 'failed', error: LOST_RUN_MESSAGE })]);
    const run = await web.getRun('run-1');
    const terminal = (await web.events('run-1', 0)).filter((e) => e.type === 'run-cancelled' || e.type === 'run-failed').map((e) => e.type);
    console.log('PROBE', JSON.stringify({ cancelled, failed, status: run?.status, error: run?.error, terminal }));
    web.close();
    worker.close();
    expect(terminal.length).toBe(2);
  });
});
