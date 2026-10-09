/**
 * Child-process body for the spend book's cross-process test: opens its own store (its own SQLite connection) on the
 * shared data directory, waits for the parent's go signal (a file appearing) so both processes start together, then
 * admits `count` calls of `usd` each against the workspace cap as fast as it can, and prints how many were admitted.
 * Loaded through Node's built-in type stripping, so this file and everything it imports must stay erasable TypeScript.
 *
 * argv: dataDir goFile workspaceId count usd capUsd label
 */
import { existsSync } from 'node:fs';
import { createStore } from '../../src/index.ts';

const [dataDir, goFile, workspaceId, count, usd, cap, label] = process.argv.slice(2) as [string, string, string, string, string, string, string];
const store = createStore({ dataDir });
try {
  while (!existsSync(goFile)) await new Promise((r) => setTimeout(r, 2));
  let admitted = 0;
  let refused = 0;
  for (let i = 0; i < Number(count); i++) {
    const outcome = await store.spendBook.admit({
      opId: `${label}-${i}`,
      owner: label,
      leaseMs: 60_000,
      workspaceId,
      purpose: 'advisor.intake',
      kind: 'completion',
      provider: 'anthropic',
      model: 'claude-x',
      reserveUsd: Number(usd),
      paid: true,
      caps: { workspaceUsd: Number(cap) },
    });
    if ('admitted' in outcome) admitted++;
    else refused++;
  }
  process.stdout.write(JSON.stringify({ admitted, refused }));
} finally {
  store.close();
}
