// Applies each mutation in turn to the clone, runs the named tests, records whether any failed, and restores the file.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
const root = process.argv[2];
const list = (await import((await import("node:url")).pathToFileURL(process.argv[3]).href)).default;
const only = process.argv[4] ? new Set(process.argv[4].split(',')) : undefined;
const log = process.argv[5];
for (const m of list) {
  if (only && !only.has(m.id)) continue;
  const path = join(root, m.file);
  const orig = readFileSync(path, 'utf8');
  const count = orig.split(m.from).length - 1;
  if (count !== 1) { appendFileSync(log, `${m.id}\tBAD-MATCH(${count})\n`); continue; }
  writeFileSync(path, orig.replace(m.from, m.to));
  const t0 = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', ...m.tests], { cwd: root, encoding: 'utf8', shell: true, maxBuffer: 1 << 28 });
  writeFileSync(path, orig);
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const files = out.match(/Test Files\s+[^\n]*/)?.[0] ?? 'no summary';
  const tests = out.match(/Tests\s+[^\n]*/)?.[0] ?? '';
  const failed = [...out.matchAll(/FAIL\s+(\S+) > ([^\n]*)/g)].map((x) => `${x[1]} > ${x[2]}`.slice(0, 200));
  const verdict = r.status === 0 ? 'SURVIVED' : 'KILLED';
  appendFileSync(log, `${m.id}\t${verdict}\t${files} | ${tests}\t${Math.round((Date.now() - t0) / 1000)}s\n${failed.slice(0, 4).map((f) => `    ${f}`).join('\n')}${failed.length ? '\n' : ''}`);
}
