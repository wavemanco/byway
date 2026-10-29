import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AdmitRequest, LedgerEntry } from '@byway/contracts';
import { createStore as createMainStore } from '../main-src/store.ts';
import { createStore } from '../src/index.ts';
import { tempDir } from './helpers.ts';

let t = Date.parse('2026-10-22T09:00:00.000Z');
const clock = () => new Date(t);
const tick = (ms = 1000) => (t += ms);

const admitOf = (over: Partial<AdmitRequest>): AdmitRequest => ({
  opId: 'op',
  owner: 'owner-a',
  leaseMs: 60_000,
  workspaceId: 'default',
  runId: 'run-1',
  purpose: 'build:prose',
  kind: 'completion',
  provider: 'anthropic',
  model: 'm',
  reserveUsd: 0.1,
  paid: true,
  caps: { workspaceUsd: 1000 },
  ...over,
});

function dump(file: string) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => String(r.name));
    const out: Record<string, unknown[]> = {};
    for (const name of tables) {
      if (name === 'schema_version') continue;
      const cols = db.prepare(`PRAGMA table_info(${name})`).all().map((c) => String(c.name));
      const withoutRowid = String((db.prepare("SELECT sql FROM sqlite_master WHERE name = ?").get(name) as { sql: string }).sql).includes('WITHOUT ROWID');
      const sel = cols.map((c) => `${c}, typeof(${c}) AS "t_${c}"`).join(', ');
      out[name] = db.prepare(`SELECT ${withoutRowid ? '' : 'rowid AS _rowid, '}${sel} FROM ${name} ORDER BY ${withoutRowid ? '1' : 'rowid'}`).all();
    }
    return out;
  } finally {
    db.close();
  }
}

describe('probe: a main-built database with real rows migrated by block 2', () => {
  it('keeps every row exactly', async () => {
    const dataDir = tempDir();
    const main = createMainStore({ dataDir, now: clock });
    const ws = await main.ensureDefaultWorkspace();
    await main.createRun({ id: 'run-1', workspaceId: ws.id, recipeId: 'c5', recipeHash: `sha256:${'a'.repeat(64)}`, profileId: 'best', title: 'T', problem: 'P', medium: 'media', budgetUsd: 50 });
    await main.setMemo('run-1', 'run-1/a/-/1/complete/abc/1', 'sha256:x');
    const book = main.spendBook;
    const W = ws.id;
    // live open call
    await book.admit(admitOf({ opId: 'op-open', workspaceId: W, operationKey: 'k-open' }));
    tick();
    // live sent call, under way
    await book.admit(admitOf({ opId: 'op-sent', workspaceId: W, operationKey: 'k-sent', reserveUsd: 0.1 + 0.2 }));
    await book.markSent('op-sent', 'owner-a');
    tick();
    // accepted fal clip with both roles
    await book.admit(admitOf({ opId: 'op-clip', workspaceId: W, operationKey: 'k-clip', kind: 'video', provider: 'fal', model: 'fal-ai/kling', reserveUsd: 1.6800000000000002 }));
    await book.markSent('op-clip', 'owner-a');
    await book.accept('op-clip', 'generation', 'req-gen-1');
    tick();
    await book.accept('op-clip', 'extract', 'req-ext-1');
    tick();
    // may have been billed: failed
    await book.admit(admitOf({ opId: 'op-failed', workspaceId: W, operationKey: 'k-failed' }));
    await book.markSent('op-failed', 'owner-a');
    await book.abandon('op-failed', 'failed');
    tick();
    // interrupted
    await book.admit(admitOf({ opId: 'op-int', workspaceId: W }));
    await book.markSent('op-int', 'owner-a');
    await book.abandon('op-int', 'interrupted');
    tick();
    // settled, unledgered and ledgered
    await book.admit(admitOf({ opId: 'op-set1', workspaceId: W, operationKey: 'k-set1' }));
    await book.markSent('op-set1', 'owner-a');
    const entry = { workspaceId: W, runId: 'run-1', stepId: 's', purpose: 'build:prose', kind: 'completion', provider: 'anthropic', requestedModel: 'm', servedModel: 'm-2026', costUsd: 0.123456789, priceBasis: 'table', inputTokens: 1, outputTokens: 2 } as never;
    await book.settle('op-set1', { entry, at: clock().toISOString(), holdMs: 120_000 });
    tick();
    await book.admit(admitOf({ opId: 'op-set2', workspaceId: W }));
    await book.markSent('op-set2', 'owner-a');
    await book.settle('op-set2', { entry: { ...(entry as object), costUsd: 0.5 } as never, at: clock().toISOString() });
    const un = await book.unledgered(10);
    await book.markLedgered(un[1]!.opId, 7);
    tick();
    // retained then released
    await book.admit(admitOf({ opId: 'op-ret', workspaceId: W }));
    await book.markSent('op-ret', 'owner-a');
    await book.retain('op-ret', 0.05, 1000);
    await book.release('op-ret');
    tick();
    // cleared
    await book.admit(admitOf({ opId: 'op-clr', workspaceId: W }));
    await book.markSent('op-clr', 'owner-a');
    await book.abandon('op-clr', 'failed');
    await book.clearUncertain(W, ['op-clr']);
    tick();
    // a key given up: sent row whose lease ran out, then the same key admitted again
    await book.admit(admitOf({ opId: 'op-gone', workspaceId: W, operationKey: 'k-gone', leaseMs: 1000 }));
    await book.markSent('op-gone', 'owner-a');
    tick(5000);
    await book.admit(admitOf({ opId: 'op-gone2', workspaceId: W, operationKey: 'k-gone', owner: 'owner-b' }));
    tick();
    // an accepted clip whose holder died (lease ran out), to be resumed after the migration
    await book.admit(admitOf({ opId: 'op-orphan-clip', workspaceId: W, operationKey: 'k-orphan', kind: 'video', provider: 'fal', model: 'fal-ai/kling', leaseMs: 1000 }));
    await book.markSent('op-orphan-clip', 'owner-a');
    await book.accept('op-orphan-clip', 'generation', 'req-gen-2');
    tick(5000);
    const beforeSpend = await book.spend(W);
    const beforeRecords = await book.records(W);
    const file = main.dbPath;
    main.close();
    const before = dump(file);

    const store = createStore({ dataDir, now: clock });
    const after = dump(store.dbPath);
    const afterSpend = await store.spendBook.spend(W);
    const afterRecords = await store.spendBook.records(W);
    // Every table but paid_operations and the new answer_waits is the same.
    for (const name of Object.keys(before)) {
      if (name === 'paid_operations') continue;
      expect(after[name], name).toEqual(before[name]);
    }
    expect(after.answer_waits).toEqual([]);
    const strip = (r: Record<string, unknown>) => {
      const { provider_jobs_at, t_provider_jobs_at, waited, t_waited, ...rest } = r;
      return { rest, added: { provider_jobs_at, t_provider_jobs_at, waited, t_waited } };
    };
    const a = (after.paid_operations as Record<string, unknown>[]).map(strip);
    expect(a.map((x) => x.rest)).toEqual(before.paid_operations);
    for (const x of a) expect(x.added).toEqual({ provider_jobs_at: null, t_provider_jobs_at: 'null', waited: null, t_waited: 'null' });
    expect(afterSpend).toEqual(beforeSpend);
    expect(afterRecords).toEqual(beforeRecords);
    console.log('ROWS', before.paid_operations.length, JSON.stringify(beforeSpend));
    // integrity and the schema of a fresh database
    const db = new DatabaseSync(store.dbPath, { readOnly: true });
    const fresh = createStore({ dataDir: tempDir() });
    const fdb = new DatabaseSync(fresh.dbPath, { readOnly: true });
    try {
      expect(db.prepare('PRAGMA integrity_check').all()).toEqual([{ integrity_check: 'ok' }]);
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      const schema = (d: DatabaseSync) => d.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name <> 'sqlite_stat1' ORDER BY type, name").all();
      expect(schema(db)).toEqual(schema(fdb));
    } finally {
      db.close();
      fdb.close();
      fresh.close();
    }
    // The resumed clip after the migration: no acceptance time, its job
    const res = await store.spendBook.admit(admitOf({ opId: 'op-new', workspaceId: W, operationKey: 'k-orphan', kind: 'video', provider: 'fal', model: 'fal-ai/kling' }));
    expect(res).toEqual({ resume: { opId: 'op-orphan-clip', jobs: { generation: 'req-gen-2' } } });
    // The live calls still hold their keys
    expect(await store.spendBook.admit(admitOf({ opId: 'op-x', workspaceId: W, operationKey: 'k-sent' }))).toEqual({ inFlight: true });
    store.close();
  });
});
