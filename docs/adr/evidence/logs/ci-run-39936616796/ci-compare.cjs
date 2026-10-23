// Per-file Windows test durations in two CI logs, with the ratio, ordered by when the file finished in the first log.
const fs = require('fs');
const [, , a, b] = process.argv;
const read = (p) => {
  const m = new Map();
  for (const raw of fs.readFileSync(p, 'utf8').split('\n')) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
    if (!line.startsWith('verify (windows)')) continue;
    const r = line.match(/\t(\d{4}-\d\d-\d\dT[\d:.]+)Z\s+(?:✓|❯) (\S+\.test\.ts) \((\d+) tests?[^)]*\) (\d+)ms/);
    if (r) m.set(r[2], { at: r[1].slice(11, 19), ms: +r[4] });
  }
  return m;
};
const A = read(a), B = read(b);
const rows = [...A].map(([f, x]) => ({ f, at: x.at, a: x.ms, b: B.get(f)?.ms })).sort((p, q) => p.at.localeCompare(q.at));
for (const r of rows) {
  const ratio = r.b ? (r.a / r.b).toFixed(1) : '-';
  if (r.a >= 1500 || (r.b && r.a / r.b >= 3)) console.log(`${r.at} ${String(r.a).padStart(6)} ${String(r.b ?? '-').padStart(6)} x${ratio.padStart(5)} ${r.f}`);
}
