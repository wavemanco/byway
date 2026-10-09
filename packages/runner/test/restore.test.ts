/**
 * Restores of the data directory (R4; ADR-0094, ADR-0096), with the real store, artifact files, gateway, ledger and
 * exposure register (the demo mock stands in for the provider; nothing leaves this computer).
 *
 * The backup unit is the whole directory, copied while byway is stopped (ADR-0094). A restore can still mix files, and
 * the report byway prints at start (dataDirReport) makes the likely mixes visible:
 * - a whole-directory copy reopens intact and the report finds nothing (no false alarms);
 * - an artifact file that did not come back is named, with the runs that show it;
 * - a restore without `ledger.jsonl` and its head, or with an older pair, is the most likely partial restore, and the
 *   ledger's own check calls it intact: the report names the runs whose recorded cost the ledger lacks.
 *
 * Making the caps count that lost spend is review finding F03's to fix, not this report's. Its two restore cases are
 * here as expected failures tagged [F03]: each fails today with one specific outcome (the call is admitted), and turns
 * red when F03 lands, so the change that fixes it must also turn them into plain tests and remove the README's
 * "Spend after a restore" caveat (which scripts/test/backup.test.ts requires until then).
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GatewayError, type Gateway } from '@byway/contracts';
import { createGateway, EXPOSURE_FILENAME, ExposureRegister, Ledger, PRICES, readExposure, type LedgerDraft, type PriceRow } from '@byway/gateway';
import { artifactPath, createStore, type SqliteStore } from '@byway/store';
import { storeCaps } from '../src/caps.ts';
import { dataDirReport, reportLines, type DataDirReport } from '../src/data-check.ts';

/** The ledger and its head, as scripts/serve.ts and the web app name them in the data directory. */
const LEDGER = 'ledger.jsonl';
const HEAD = `${LEDGER}.head`;

/** mock-big at a price that makes a 1,000-token answer cost up to $0.10, so caps are exercised. */
const PRICED: PriceRow[] = [...PRICES.filter((p) => !(p.provider === 'mock' && p.model === 'mock-big')), { provider: 'mock', model: 'mock-big', inputPerMTok: 0, outputPerMTok: 100, source: 'restore tests' }];

const temps: string[] = [];
const tempDir = (label: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), `byway-restore-${label}-`));
  temps.push(dir);
  return dir;
};
const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Original {
  dir: string;
  workspaceId: string;
  /** A run going under a $0.20 budget that has spent $0.15: $0.05, then $0.10. */
  runId: string;
  /** A finished run whose output is a page, with a screenshot in its timeline. */
  doneId: string;
  page: string;
  shot: string;
  /** ledger.jsonl and its head as they were after the first $0.05: an older backup's pair. */
  older: { ledger: Buffer; head: Buffer };
}

const draft = (workspaceId: string, runId: string, costUsd: number): LedgerDraft => ({
  workspaceId,
  runId,
  stepId: 'write',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'mock',
  requestedModel: 'mock-big',
  servedModel: 'mock-big',
  requestSha256: `sha256:${'a'.repeat(64)}`,
  responseSha256: `sha256:${'b'.repeat(64)}`,
  usage: { inputTokens: 100, outputTokens: 1000 },
  costUsd,
  latencyMs: 5,
});

/** A data directory as byway leaves it when it stops: records, artifact files, a ledger with its head, exposure. */
async function original(): Promise<Original> {
  const dir = tempDir('original');
  const store = createStore({ dataDir: dir });
  try {
    const ws = await store.ensureDefaultWorkspace();
    const base = { workspaceId: ws.id, recipeId: 'c4', recipeHash: `sha256:${'c'.repeat(64)}`, profileId: 'demo', problem: 'Tighten my memo', medium: 'prose' as const };
    const going = await store.createRun({ ...base, id: 'run-going', title: 'Going', budgetUsd: 0.2, status: 'running' });
    const done = await store.createRun({ ...base, id: 'run-done', title: 'Done', budgetUsd: 5, status: 'running' });
    const page = await store.artifacts.putText('<p>the page</p>', 'text/html');
    const shot = await store.artifacts.put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]), 'image/png');
    await store.appendEvent({ runId: done.id, type: 'artifact', data: { artifactId: shot.id, mediaType: 'image/png', label: 'Desktop' } });
    await store.updateRun(done.id, { status: 'done', outputArtifactId: page.id });

    const ledger = new Ledger({ path: path.join(dir, LEDGER) });
    await ledger.append(draft(ws.id, going.id, 0.05));
    const older = { ledger: readFileSync(path.join(dir, LEDGER)), head: readFileSync(path.join(dir, HEAD)) };
    await ledger.append(draft(ws.id, going.id, 0.1));
    // As the runner's recordCost does after each step: the run's cost follows the ledger.
    await store.updateRun(going.id, { costUsd: 0.15 });
    await new ExposureRegister(path.join(dir, EXPOSURE_FILENAME)).record({ provider: 'openai', model: 'gpt-x' }, 'critic:prose', ws.id, new Date('2026-10-08T12:00:00Z'));
    return { dir, workspaceId: ws.id, runId: going.id, doneId: done.id, page: page.id, shot: shot.id, older };
  } finally {
    store.close();
  }
}

/** A copy of the whole directory, then the changes a partial restore makes. */
function restored(from: Original, change: { without?: string[]; olderLedger?: boolean } = {}): string {
  const dir = path.join(tempDir('restored'), 'byway');
  cpSync(from.dir, dir, { recursive: true });
  for (const name of change.without ?? []) rmSync(path.join(dir, name), { force: true });
  if (change.olderLedger) {
    writeFileSync(path.join(dir, LEDGER), from.older.ledger);
    writeFileSync(path.join(dir, HEAD), from.older.head);
  }
  return dir;
}

/** byway's store and gateway on a restored directory, as scripts/serve.ts opens them (demo mode: the mock). */
function reopen(dir: string): { store: SqliteStore; gateway: Gateway; report: (workspaceId: string) => Promise<DataDirReport> } {
  const store = createStore({ dataDir: dir });
  open.push(() => store.close());
  const gateway = createGateway({ ledgerPath: path.join(dir, LEDGER), artifacts: store.artifacts, caps: storeCaps(store), demo: true, env: {}, prices: PRICED, retry: { maxAttempts: 1 } });
  return { store, gateway, report: (workspaceId) => dataDirReport({ dataDir: dir, store, gateway, workspaceIds: [workspaceId] }) };
}

describe('the start-up report after a restore (R4)', () => {
  it('a whole-directory copy taken after byway stopped reopens intact, and the report finds nothing', async () => {
    const base = await original();
    const dir = restored(base);
    const { store, gateway, report } = reopen(dir);
    expect((await store.getRun(base.runId))?.costUsd).toBe(0.15);
    expect(await store.artifacts.getText(base.page)).toBe('<p>the page</p>');
    expect((await gateway.spend(base.workspaceId)).byRun).toEqual({ [base.runId]: 0.15 });
    expect(await readExposure(path.join(dir, EXPOSURE_FILENAME))).toEqual(await readExposure(path.join(base.dir, EXPOSURE_FILENAME)));
    expect(await readExposure(path.join(dir, EXPOSURE_FILENAME))).toHaveLength(1);
    const found = await report(base.workspaceId);
    expect(found).toEqual({ store: { database: [], artifacts: 2, missing: [] }, ledgerBrokenAt: null, unledgered: [] });
    expect(reportLines(found)).toEqual({ ok: true, lines: ["the database and its 2 artifact files are complete; the spend ledger's chain is intact and covers every run's recorded cost"] });
  });

  it('names an artifact file that did not come back, with the runs that show it', async () => {
    const base = await original();
    const dir = restored(base);
    rmSync(artifactPath(dir, base.shot));
    const found = await reopen(dir).report(base.workspaceId);
    expect(found.store.missing).toEqual([{ id: base.shot, problem: 'missing', runIds: [base.doneId] }]);
    expect(found.unledgered).toEqual([]);
    const { ok, lines } = reportLines(found);
    expect(ok).toBe(false);
    expect(lines[1]).toBe(`1 artifact file is missing or cut short (${base.shot}), so what it holds cannot be shown. Run that uses it: ${base.doneId}.`);
  });

  it('names the runs whose recorded cost the ledger lacks, after a restore without ledger.jsonl and its head', async () => {
    const base = await original();
    const { gateway, report } = reopen(restored(base, { without: [LEDGER, HEAD] }));
    // The ledger's own check cannot see a whole missing file: it calls this ledger intact.
    expect(await gateway.verifyLedger()).toBeNull();
    const found = await report(base.workspaceId);
    expect(found.ledgerBrokenAt).toBeNull();
    expect(found.unledgered).toEqual([{ runId: base.runId, storeUsd: 0.15, ledgerUsd: 0 }]);
    const text = reportLines(found).lines.join('\n');
    expect(text).toMatch(/\$0\.15 recorded, \$0\.00 in the ledger/);
    expect(text).toMatch(/caps do not count the difference/);
    expect(text).toMatch(/providers' own dashboards/);
  });

  it('names them after a restore of an older ledger and head pair too, which the ledger also calls intact', async () => {
    const base = await original();
    const found = await reopen(restored(base, { olderLedger: true })).report(base.workspaceId);
    expect(found.ledgerBrokenAt).toBeNull();
    expect(found.unledgered).toEqual([{ runId: base.runId, storeUsd: 0.15, ledgerUsd: 0.05 }]);
  });

  it('reports a ledger whose head names entries the file no longer has', async () => {
    const base = await original();
    const found = await reopen(restored(base, { without: [LEDGER] })).report(base.workspaceId);
    expect(found.ledgerBrokenAt).toEqual(expect.any(String));
    expect(found.unledgered).toEqual([{ runId: base.runId, storeUsd: 0.15, ledgerUsd: 0 }]);
    expect(reportLines(found).lines.join('\n')).toMatch(/spend ledger fails its check at entry/);
  });

  it('only reads: the records, the ledger and the artifact files are unchanged after a report', async () => {
    const base = await original();
    const dir = restored(base, { without: [LEDGER, HEAD] });
    rmSync(artifactPath(dir, base.shot));
    const { store, gateway, report } = reopen(dir);
    const before = { runs: await store.listRuns(base.workspaceId), spend: await gateway.spend(base.workspaceId) };
    await report(base.workspaceId);
    expect(await store.listRuns(base.workspaceId)).toEqual(before.runs);
    expect(await gateway.spend(base.workspaceId)).toEqual(before.spend);
    expect(await store.artifacts.has(base.shot)).toBe(false);
  });
});

/** What a call that the original spend puts over the run's $0.20 cap gets after the restore. Never throws. */
type CallOutcome = { admitted: true; ledgerSpentUsd: number } | { refused: string } | { broken: string };

/** Setup and call together: a throw anywhere (setup included) is 'broken', so an it.fails stub that sees it returns early and goes red. */
async function guarded(run: () => Promise<CallOutcome>): Promise<CallOutcome> {
  try {
    return await run();
  } catch (e) {
    return { broken: e instanceof Error ? e.message : String(e) };
  }
}

async function overCapCall(dir: string, base: Original): Promise<CallOutcome> {
  try {
    const { gateway } = reopen(dir);
    const ledgerSpentUsd = (await gateway.spend(base.workspaceId)).byRun[base.runId] ?? 0;
    try {
      // Up to $0.10: with the original $0.15 counted that is over the $0.20 cap.
      await gateway.complete({ workspaceId: base.workspaceId, runId: base.runId, stepId: 'write', purpose: 'build:prose', profileId: 'demo', tier: 'big', messages: [{ role: 'user', content: [{ type: 'text', text: 'Tighten this.' }] }], maxOutputTokens: 1000 });
      return { admitted: true, ledgerSpentUsd };
    } catch (e) {
      if (e instanceof GatewayError) return { refused: e.code };
      throw e;
    }
  } catch (e) {
    return { broken: e instanceof Error ? e.message : String(e) };
  }
}

describe('[F03] caps after a restore that lost spend (expected failures until F03 makes spend fail closed)', () => {
  it('[control] with the whole directory restored, the call over the cap is refused', async () => {
    const base = await original();
    expect(await overCapCall(restored(base), base)).toEqual({ refused: 'budget-exceeded' });
  });

  // Each stub may fail for one reason only, today's fail-open outcome (the call admitted, the restored ledger counting
  // `spent` for the run). A broken setup or any other outcome returns early, and an `it.fails` that finishes is red.
  it.fails('[F03] without ledger.jsonl and its head, a call the original spend puts over the run cap is refused', async () => {
    const outcome = await guarded(async () => {
      const base = await original();
      return overCapCall(restored(base, { without: [LEDGER, HEAD] }), base);
    });
    if (!('admitted' in outcome) || outcome.ledgerSpentUsd !== 0) return;
    expect(outcome).toEqual({ refused: 'budget-exceeded' });
  });

  it.fails('[F03] with an older ledger and head pair, a call the original spend puts over the run cap is refused', async () => {
    const outcome = await guarded(async () => {
      const base = await original();
      return overCapCall(restored(base, { olderLedger: true }), base);
    });
    if (!('admitted' in outcome) || outcome.ledgerSpentUsd !== 0.05) return;
    expect(outcome).toEqual({ refused: 'budget-exceeded' });
  });
});
