/**
 * The spend book over byway.sqlite (ADR-0095): the contract suite on two connections to one file (as the web process
 * and the worker each hold one) and on a private in-memory database, then two separate processes admitting against one
 * remaining budget, which a per-process reservation could not see (F03).
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { admitRequest, settlement, spendBookContract } from '@byway/contracts/spend-book-suite';
import { MIGRATIONS, SCHEMA_VERSION, openSpendBook } from '../src/index.ts';
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
  it('is migration 6 (with its operation keys, migration 7), and two stores on one data directory share it', async () => {
    expect(SCHEMA_VERSION).toBe(7);
    expect(MIGRATIONS[5]?.name).toBe('spend-book');
    expect(MIGRATIONS[6]?.name).toBe('operation-keys');
    const dataDir = tempDir();
    const web = openStore({ dataDir });
    const worker = openStore({ dataDir });
    const call = admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 0.15 } });
    expect(await web.spendBook.admit(call)).toEqual({ admitted: true });
    expect(await worker.spendBook.admit(admitRequest({ reserveUsd: 0.1, caps: { workspaceUsd: 0.15 } }))).toMatchObject({ budget: { scope: 'workspace', reservedUsd: 0.1, estimateUsd: 0.1 } });
    await web.spendBook.settle(call.opId, settlement(0.1));
    expect(await worker.spendBook.spend('ws')).toMatchObject({ spentUsd: 0.1, inFlightUsd: 0 });
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
