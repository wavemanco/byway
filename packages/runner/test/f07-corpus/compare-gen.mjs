// Compares a run of the generators (gen13.mts and gen-v14.mts, each job writing where the README's commands put it:
// <out>/gen/<job> and <out>/genv/<job>) with the baseline taken on Playwright 1.63.0 (expected/generators-1.63.0, the
// same layout; F07 (a), 2026-11-01 and 02). For each of the baseline's jobs it compares the tally's counts, then every
// edit the job lists, matched by page and answer: the arbiter's refusals (.refusals.jsonl), the stored writes the
// oracle judged otherwise (.judged.jsonl) and, for gen-v14, what threw (.threw.jsonl). The pages are seeded, so a job
// makes the same pages each run while each page is offered the same lines: both generators draw each page's edits from
// the stream that makes their pages, a draw for each line offered and more for each line edited, so after a page
// offered other lines the job's later pages differ, its later edits show as DIFFERENT, and it is read by its counts. An edit
// stored and judged right, one that changed nothing and one the reader or placement refused are listed nowhere, so an
// edit listed in one run alone shows against NOT LISTED, and the counts say which of those it is.
// Usage: node compare-gen.mjs <out> [<baseline>]. Exits 1 when a count, a list or an edit differs or a job is missing,
// and 2 when a folder does not exist. As compare.mjs does, it prints an edit both runs list with the same outcome and
// another verdict from the oracle as VERDICT DIFFERS, and any other change as DIFFERENT; vo13 judges on the real clock,
// so expect some VERDICT DIFFERS lines from gen-v14's jobs. The jobs append to their lists, so a job run again into the
// same folder must have its files removed first: a list longer than its tally's count is reported as LIST.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [dir, base = fileURLToPath(new URL('./expected/generators-1.63.0', import.meta.url))] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node compare-gen.mjs <out folder> [<baseline folder>]');
  process.exit(2);
}
for (const d of [dir, base])
  if (!existsSync(d)) {
    console.error('no such folder:', d);
    process.exit(2);
  }
const LISTS = [['refusals', 'REFUSED'], ['judged', 'STORED'], ['threw', 'THREW']];
const NOT_LISTED = { outcome: 'NOT LISTED (stored and judged right, changed nothing, or refused by the reader or placement)', verdict: '' };
const lines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// Each listed edit's outcome, keyed by page, answer and how many times the job listed that page and answer before.
const edits = (job) => {
  const out = new Map();
  for (const [list, kind] of LISTS)
    for (const e of lines(`${job}.${list}.jsonl`)) {
      const at = `${e.html}\u0000${JSON.stringify(e.answer ?? null)}`;
      let n = 1;
      while (out.has(`${at}\u0000${n}`)) n++;
      out.set(`${at}\u0000${n}`, { outcome: kind === 'STORED' ? kind : `${kind}: ${e.m ?? e.harness}`, verdict: e.oracle ?? e.v ?? e.judged ?? '', answer: e.answer ?? null });
    }
  return out;
};
// How many lines each list should hold by the tally (gen13 lists nothing that threw; gen-v14 lists every throw).
const expectedLines = (sub, stats) => ({
  refusals: stats.arbiterRefused ?? 0,
  judged: (stats.stored ?? 0) - (stats['stored, judged ok'] ?? stats['stored judged ok'] ?? 0),
  threw: sub === 'genv' ? (stats.threw ?? 0) + (stats.openThrew ?? 0) + (stats.harnessThrew ?? 0) : 0,
});
let different = 0;
let verdictOnly = 0;
let missing = 0;
let counts = 0;
let lists = 0;
let jobs = 0;
for (const sub of ['gen', 'genv']) {
  const b = path.join(base, sub);
  if (!existsSync(b)) continue;
  for (const f of readdirSync(b).filter((f) => f.endsWith('.json')).sort()) {
    const job = f.replace(/\.json$/, '');
    const now = path.join(dir, sub, job);
    jobs++;
    if (!existsSync(`${now}.json`)) {
      missing++;
      console.log('MISSING', `${sub}/${job}`);
      continue;
    }
    const was = JSON.parse(readFileSync(path.join(b, f), 'utf8'));
    const is = JSON.parse(readFileSync(`${now}.json`, 'utf8'));
    if (!is.done || is.n !== was.n) {
      missing++;
      console.log('MISSING', `${sub}/${job}`, `(${is.done ? 'finished' : 'stopped'} after ${is.n} of ${was.n} pages)`);
      continue;
    }
    for (const [where, tally] of [['baseline', was], ['now', is]]) {
      const want = expectedLines(sub, tally.stats);
      for (const [list] of LISTS) {
        const have = lines(`${where === 'baseline' ? path.join(b, job) : now}.${list}.jsonl`).length;
        if (have !== want[list]) {
          lists++;
          console.log('LIST', `${sub}/${job}`, `${where}: .${list}.jsonl has ${have} lines, its tally counts ${want[list]}`);
        }
      }
    }
    // A refusal by the reader or placement is in no list, so an edit that moves to or from one shows in the counts alone.
    for (const k of [...new Set([...Object.keys(was.stats), ...Object.keys(is.stats)])])
      if ((was.stats[k] ?? 0) !== (is.stats[k] ?? 0)) {
        counts++;
        console.log('COUNT', `${sub}/${job}`, k, `baseline: ${was.stats[k] ?? 0}`, `now: ${is.stats[k] ?? 0}`);
      }
    const before = edits(path.join(b, job));
    const after = edits(now);
    for (const k of [...new Set([...before.keys(), ...after.keys()])]) {
      const x = before.get(k) ?? NOT_LISTED;
      const y = after.get(k) ?? NOT_LISTED;
      if (x.outcome === y.outcome && x.verdict === y.verdict) continue;
      // NOT LISTED is an outcome of its own, so the same outcome means both runs list the edit.
      const onlyVerdict = x.outcome === y.outcome;
      different++;
      if (onlyVerdict) verdictOnly++;
      console.log(`${onlyVerdict ? 'VERDICT DIFFERS' : 'DIFFERENT'} ${sub}/${job} answer ${JSON.stringify((before.get(k) ?? after.get(k)).answer).slice(0, 200)}`);
      console.log(`  baseline: ${x.outcome} ${x.verdict}`.trimEnd());
      console.log(`  now:      ${y.outcome} ${y.verdict}`.trimEnd());
    }
  }
}
console.log(`${jobs} jobs in the baseline: ${missing} missing; ${counts} counts, ${lists} lists and ${different} edits different (${verdictOnly} of them the same outcome, the oracle's verdict alone differing)`);
process.exit(different || counts || lists || missing || !jobs ? 1 : 0);
