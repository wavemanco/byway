// Read-only: count the "changed by" pairs in docs/adr/README.md and the ADRs that carry Related rows.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const repo = process.argv[2];
const idx = readFileSync(join(repo, 'docs/adr/README.md'), 'utf8');
let targets = 0, pairs = 0;
const changers = new Set();
for (const line of idx.split('\n')) {
  if (!line.startsWith('| [ADR-')) continue;
  const m = line.match(/changed by (.*?)\|/);
  if (!m) continue;
  targets++;
  const ids = [...m[1].matchAll(/ADR-(\d{4})/g)].map((x) => x[1]);
  pairs += ids.length;
  ids.forEach((i) => changers.add(i));
}
const files = readdirSync(join(repo, 'docs/adr')).filter((f) => /^\d{4}-.*\.md$/.test(f));
let related = 0, laterOrChanges = 0;
for (const f of files) {
  const t = readFileSync(join(repo, 'docs/adr', f), 'utf8');
  if (/\|\s*\*\*Related\*\*/.test(t)) related++;
  if (/## Later records|\*\*Changes\*\*/.test(t)) laterOrChanges++;
}
console.log({ targets, pairs, changers: [...changers].sort().join(','), files: files.length, related, laterOrChanges });
