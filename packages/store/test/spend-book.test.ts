/**
 * The spend book over byway.sqlite (ADR-0095): the contract suite on two connections to one file (as the web process
 * and the worker each hold one) and on a private in-memory database, then two separate processes admitting against one
 * remaining budget, which a per-process reservation could not see (F03).
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { admitRequest, settlement, spendBookContract } from '@byway/contracts/spend-book-suite';
import { MIGRATIONS, SCHEMA_VERSION, SqliteSpendBook, migrate, openDatabase, openSpendBook } from '../src/index.ts';
import { openStore, tempDir } from './helpers.ts';

function clock() {
  let t = Date.parse('2026-10-08T12:00:00.000Z');
  return { now: () => new Date(t), advance: (ms: number) => void (t += ms) };
}

spendBookContract('SQLite, two connections on one file', () => {
  const file = path.join(tempDir(), 'byway.sqlite');
  const c = clock();
  const a = openSpendBook(file, { now: c.now });
  const b = openSpendBook(file, { now: c.now });
  return {
    a,
    b,
    advance: c.advance,
    close: () => {
      a.close();
      b.close();
    },
  };
});

spendBookContract('SQLite in memory', () => {
  const c = clock();
  const book = openSpendBook(':memory:', { now: c.now });
  return { a: book, b: book, advance: c.advance, close: () => book.close() };
});

describe('the store’s spend book', () => {
  it('is migration 6 (with its operation keys, migration 7, its answer waits, migration 10, and its retained sends’ waits, migration 11), and two stores on one data directory share it', async () => {
    // Migrations 8 (the page renderer's settings, ADR-0105) and 9 (each model's answer wait) came between them.
    expect(SCHEMA_VERSION).toBe(11);
    expect(MIGRATIONS[5]?.name).toBe('spend-book');
    expect(MIGRATIONS[6]?.name).toBe('operation-keys');
    expect(MIGRATIONS[9]?.name).toBe('spend-book-waits');
    expect(MIGRATIONS[10]?.name).toBe('spend-book-retained-waits');
    const dataDir = tempDir();
    const web = openStore({ dataDir });
    const worker = openStore({ dataDir });
    const call = admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 0.15 } });
    expect(await web.spendBook.admit(call)).toEqual({ admitted: true });
    expect(await worker.spendBook.admit(admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 0.15 } }))).toMatchObject({ budget: { scope: 'workspace', reservedUsd: 0.1, estimateUsd: 0.1 } });
    await web.spendBook.settle(call.opId, settlement(0.1));
    expect(await worker.spendBook.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0 });
  });

  it('sweeps run-out leases through the partial index of live rows, not a scan of every call ever made', () => {
    const db = new DatabaseSync(':memory:');
    try {
      migrate(db);
      const prepare = vi.spyOn(db, 'prepare');
      new SqliteSpendBook(db);
      const sweeps = prepare.mock.calls.map(([sql]) => sql).filter((sql) => sql.startsWith('UPDATE paid_operations') && sql.includes('lease_until <= :now') && !sql.includes(':id') && !sql.includes(':owner'));
      expect(sweeps).toHaveLength(2);
      for (const sql of sweeps) {
        const plan = (db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all({ now: 0, at: 'x' }) as { detail: string }[]).map((r) => r.detail).join('\n');
        expect(plan).toMatch(/USING INDEX paid_operations_live/);
      }
    } finally {
      db.close();
    }
  });

  it('commits admit, markSent, accept and settle with synchronous=FULL and puts NORMAL back, even when one throws; the other writes stay NORMAL', async () => {
    const db = openDatabase(path.join(tempDir(), 'byway.sqlite'));
    try {
      migrate(db);
      const book = new SqliteSpendBook(db);
      const exec = vi.spyOn(db, 'exec');
      const watched = async (fn: () => Promise<unknown>) => {
        exec.mockClear();
        await fn().catch(() => undefined);
        return exec.mock.calls.map(([sql]) => sql);
      };
      const durable = (end: string) => ['PRAGMA synchronous = FULL', 'BEGIN IMMEDIATE', end, 'PRAGMA synchronous = NORMAL'];
      const r = admitRequest({ kind: 'video', provider: 'fal', model: 'fal-ai/kling' });
      expect(await watched(() => book.admit(r))).toEqual(durable('COMMIT'));
      expect(await watched(() => book.markSent(r.opId, 'owner-a'))).toEqual(durable('COMMIT'));
      expect(await watched(() => book.accept(r.opId, 'generation', 'req-gen'))).toEqual(durable('COMMIT'));
      expect(await watched(() => book.retain(r.opId, 0.01, 10))).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
      expect(await watched(() => book.settle(r.opId, settlement(0.1)))).toEqual(durable('COMMIT'));
      // The same opId again fails on the primary key inside the transaction.
      expect(await watched(() => book.admit(r))).toEqual(durable('ROLLBACK'));
      expect(await watched(() => book.markLedgered(r.opId, 1))).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
      expect(await watched(() => book.clearUncertain('ws', [r.opId]))).toEqual(['BEGIN IMMEDIATE', 'COMMIT']);
      exec.mockRestore();
      expect(db.prepare('PRAGMA synchronous').get()).toEqual({ synchronous: 1 });
    } finally {
      db.close();
    }
  });

  it('refuses work once the store is closed', async () => {
    const store = openStore();
    store.close();
    await expect(store.spendBook.spend('ws')).rejects.toMatchObject({ code: 'closed' });
  });
});

const FIXTURE = fileURLToPath(new URL('./fixtures/admit-process.ts', import.meta.url));

function admitInChild(args: string[]): Promise<{ admitted: number; refused: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [FIXTURE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(JSON.parse(out) as { admitted: number; refused: number }) : reject(new Error(`admit child exited with ${code}: ${err}`))));
  });
}

describe('two processes admitting against one remaining budget (F03)', () => {
  it('admit exactly as many calls together as the budget holds', async () => {
    const dataDir = tempDir();
    const store = openStore({ dataDir });
    const go = path.join(dataDir, 'go');
    const children = ['web', 'worker'].map((label) => admitInChild([dataDir, go, 'ws-shared', '30', '0.05', '1', label]));
    // Both children open the store and wait; then they start together.
    await new Promise((r) => setTimeout(r, 1500));
    writeFileSync(go, '');
    const [a, b] = await Promise.all(children);
    expect(a!.admitted + b!.admitted).toBe(20);
    expect(a!.refused + b!.refused).toBe(40);
    expect(await store.spendBook.spend('ws-shared')).toMatchObject({ inFlightUsd: 1, spentUsd: 0 });
  }, 60_000);
});
