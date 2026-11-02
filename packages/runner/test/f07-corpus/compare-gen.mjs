// Compares a run of the generators (gen13.mts and gen-v14.mts, each job writing where the README's commands put it:
// <out>/gen/<job> and <out>/genv/<job>) with the baseline taken on Playwright 1.63.0 (expected/generators-1.63.0, the
// same layout; F07 (a), 2026-11-01 and 02). For each of the baseline's jobs it compares the tally's counts, then every
// edit the job lists, matched by page and answer: the arbiter's refusals (.refusals.jsonl), the stored writes the
// oracle judged otherwise (.judged.jsonl) and, for gen-v14, what threw (.threw.jsonl). The pages are seeded, so a job
// makes the same pages each run while each page is offered the same lines; gen-v14 draws its edits from its pages'
// stream, one draw for each line offered, so after a page offered otherwise its pages differ, and its edits from there
// show as DIFFERENT: read its counts then. An edit stored and judged right is listed nowhere, so one the arbiter refuses
// in only one of the two runs shows as listed in that run alone.
// Usage: node compare-gen.mjs <out> [<baseline>]. Exits 1 when a count or an edit differs or a job is missing, and 2
// when a folder does not exist. As compare.mjs does, it prints an edit with the same outcome and the oracle's verdict
// alone differing as VERDICT DIFFERS, and any other change as DIFFERENT; vo13 judges on the real clock, so expect some
// VERDICT DIFFERS lines from gen-v14's jobs.
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
const lines = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
// One edit's outcome in a list: what refused or threw it (or that it was stored) and the oracle's verdict.
const edits = (job) => {
  const out = new Map();
  for (const [list, kind] of [['refusals', 'REFUSED'], ['judged', 'STORED'], ['threw', 'THREW']])
    for (const e of lines(`${job}.${list}.jsonl`))
      out.set(`${e.html}\u0000${JSON.stringify(e.answer ?? null)}`, { outcome: kind === 'STORED' ? kind : `${kind}: ${e.m ?? e.harness}`, verdict: e.oracle ?? e.v ?? e.judged ?? '', answer: e.answer });
  return out;
};
let different = 0;
let verdictOnly = 0;
let missing = 0;
let counts = 0;
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
    if (!is.done) {
      missing++;
      console.log('MISSING', `${sub}/${job}`, `(stopped after ${is.n} of ${was.n} pages)`);
      continue;
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
      const x = before.get(k) ?? { outcome: 'STORED', verdict: 'ok' };
      const y = after.get(k) ?? { outcome: 'STORED', verdict: 'ok' };
      if (x.outcome === y.outcome && x.verdict === y.verdict) continue;
      const onlyVerdict = x.outcome === y.outcome;
      different++;
      if (onlyVerdict) verdictOnly++;
      console.log(`${onlyVerdict ? 'VERDICT DIFFERS' : 'DIFFERENT'} ${sub}/${job} answer ${JSON.stringify((before.get(k) ?? after.get(k)).answer).slice(0, 200)}`);
      console.log(`  baseline: ${x.outcome} ${x.verdict}`.trimEnd());
      console.log(`  now:      ${y.outcome} ${y.verdict}`.trimEnd());
    }
  }
}
console.log(`${jobs} jobs in the baseline: ${missing} missing; ${counts} counts and ${different} edits different (${verdictOnly} of them the same outcome, the oracle's verdict alone differing)`);
process.exit(different || counts || missing || !jobs ? 1 : 0);
