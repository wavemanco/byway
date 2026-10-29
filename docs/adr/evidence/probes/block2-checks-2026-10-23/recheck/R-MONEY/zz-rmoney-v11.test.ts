// r-money probe: the version-10 book the code at 160c027 wrote, opened by this code (migration 11), and its words.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { it, expect } from 'vitest';
import { openSpendBook, SCHEMA_VERSION } from '@byway/store';
import { uncertainReason } from '../src/view/spending.ts';

const DIR = 'C:/Users/arvik/AppData/Local/Temp/claude/C--Users-arvik-code-byway/67b5b9ac-8595-4cc6-898a-d7d911b9d422/scratchpad/rm-db';
it('upgrades the old file and lists the same money', async () => {
  expect(SCHEMA_VERSION).toBe(11);
  const file = path.join(DIR, 'byway.sqlite');
  const before = JSON.parse(readFileSync(path.join(DIR, 'v10-view.json'), 'utf8'));
  let t = Date.parse('2026-10-22T12:00:01.000Z');
  const book = openSpendBook(file, { now: () => new Date(t) });
  const records = await book.records('ws');
  const spend = await book.spend('ws');
  const out: string[] = [];
  out.push('spend before ' + JSON.stringify(before.spend));
  out.push('spend after  ' + JSON.stringify(spend));
  for (const u of records.uncertain) out.push(`${u.opId} ${u.reason} usd=${u.usd} retainedUsd=${u.retainedUsd} retainedWaited=${JSON.stringify(u.retainedWaited)}\n   ${uncertainReason(u)}`);
  // strip the new fields and compare with what the old code listed
  const strip = (r: any) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'retainedUsd' || k === 'retainedWaited' ? undefined : v)));
  out.push('same records (new fields aside): ' + String(JSON.stringify(strip(records)) === JSON.stringify(before.records)));
  // the in-flight call carries on across the upgrade: a second retained send after a silence, then it settles
  t += 1000;
  const r2 = await book.retain('op-open', 0.3, 100, { minutes: 15, how: 'silence' });
  out.push('retain on old open row ' + JSON.stringify(r2));
  await book.settle('op-open', { at: new Date(t).toISOString(), entry: { workspaceId: 'ws', runId: 'run', stepId: 'draft', purpose: 'build:prose', kind: 'completion', provider: 'anthropic', requestedModel: 'claude-x', servedModel: 'claude-x', requestSha256: `sha256:${'a'.repeat(64)}`, responseSha256: `sha256:${'b'.repeat(64)}`, usage: { inputTokens: 10, outputTokens: 20 }, costUsd: 0.2, latencyMs: 5 } });
  const after = await book.records('ws');
  for (const u of after.uncertain.filter((x) => x.opId === 'op-open')) out.push(`op-open after ${u.reason} usd=${u.usd} retainedUsd=${u.retainedUsd} retainedWaited=${JSON.stringify(u.retainedWaited)}\n   ${uncertainReason(u)}`);
  out.push('spend end ' + JSON.stringify(await book.spend('ws')));
  book.close();
  const db = new DatabaseSync(file);
  out.push('versions ' + JSON.stringify(db.prepare('SELECT version, name FROM schema_version ORDER BY version').all()));
  out.push('integrity ' + JSON.stringify(db.prepare('PRAGMA integrity_check').all()));
  out.push('cols ' + JSON.stringify((db.prepare('PRAGMA table_info(paid_operations)').all() as any[]).map((c) => c.name).slice(-4)));
  db.close();
  writeFileSync(path.join(DIR, 'v11-view.txt'), out.join('\n'));
});
