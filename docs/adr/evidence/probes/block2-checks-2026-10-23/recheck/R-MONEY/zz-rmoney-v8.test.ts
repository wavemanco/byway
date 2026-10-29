// r-money probe: a version-10 spend book written by the code at 160c027, through its own API, left on disk.
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { it, expect } from 'vitest';
import { admitRequest, settlement } from '@byway/contracts/spend-book-suite';
import { openSpendBook, SCHEMA_VERSION } from '../src/index.ts';

const DIR = 'C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rm-db8';
it('writes a v10 book with retained, waited, failed, open and settled rows', async () => {
  expect(SCHEMA_VERSION).toBe(8);
  rmSync(DIR, { recursive: true, force: true });
  mkdirSync(DIR, { recursive: true });
  const file = path.join(DIR, 'byway.sqlite');
  let t = Date.parse('2026-10-22T12:00:00.000Z');
  const book = openSpendBook(file, { now: () => new Date(t) });
  const caps = { workspaceUsd: 100, runUsd: 50 };
  // resent: retained once, then settled
  await book.admit(admitRequest({ opId: 'op-resent', reserveUsd: 0.05, caps }));
  await book.markSent('op-resent', 'owner-a');
  expect(await book.retain('op-resent', 0.05, 100)).toEqual({ retained: true });
  await book.settle('op-resent', settlement(0.03));
  // waited after a retain (both sends silent)
  await book.admit(admitRequest({ opId: 'op-waited2', reserveUsd: 0.4, caps }));
  await book.markSent('op-waited2', 'owner-a');
  await book.retain('op-waited2', 0.4, 100);
  await book.abandon('op-waited2', 'interrupted');
  // failed after a retain
  await book.admit(admitRequest({ opId: 'op-failed', reserveUsd: 0.2, caps }));
  await book.markSent('op-failed', 'owner-a');
  await book.retain('op-failed', 0.2, 100);
  await book.abandon('op-failed', 'failed');
  // a clip that waited, with its job
  await book.admit(admitRequest({ opId: 'op-clip', kind: 'video', provider: 'fal', model: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', reserveUsd: 0.5, caps, operationKey: 'run/clip/video/abc/1' }));
  await book.markSent('op-clip', 'owner-a');
  await book.accept('op-clip', 'generation', 'req-1');
  await book.abandon('op-clip', 'failed');
  // an open, sent call with a retain, its lease still running (an in-flight call across the upgrade)
  await book.admit(admitRequest({ opId: 'op-open', reserveUsd: 0.3, leaseMs: 10 * 60_000, caps, operationKey: 'run/draft/completion/xyz/1' }));
  await book.markSent('op-open', 'owner-a');
  await book.retain('op-open', 0.3, 100);
  // a plain settled call
  await book.admit(admitRequest({ opId: 'op-plain', reserveUsd: 0.1, caps }));
  await book.settle('op-plain', settlement(0.08));
  t += 1000;
  const records = await book.records('ws');
  const spend = await book.spend('ws');
  writeFileSync(path.join(DIR, 'v8-view.json'), JSON.stringify({ records, spend }, null, 1));
  book.close();
});
