// Compares a run of real14r.mts with round 14's (expected/round14.json, from round 14's runs at 6285122): each answer's
// outcome, keyed by the oracle (a group named G… is judged by oracle12, V… by vo13), the page, the line, the kind of
// edit and the answer line. The outcome is what round 14's cmp13b.cjs compared: stored, with the oracle's verdict;
// refused by the arbiter, with its reason; or refused by the reader or placement (the start of the message).
// Usage: node compare.mjs <the run's output folder>. Exits 1 when an outcome differs, an answer is not in round 14, or
// an answer of round 14's is missing from the run (a group stopped, or a page not run).
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node compare.mjs <output folder of real14r.mts>');
  process.exit(2);
}
const expected = JSON.parse(readFileSync(new URL('./expected/round14.json', import.meta.url), 'utf8'));
const outcome = (e) => (e.kindOut === 'STORED' ? `STORED ${e.verdict?.v ?? ''}` : /^REFUSED\(arbiter: ([^;]*);/.exec(e.result)?.[0] ?? (e.result || '').slice(0, 40)).trimEnd();
let same = 0;
let different = 0;
let verdictOnly = 0;
let unknown = 0;
const pages = new Set();
const seen = new Set();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const run = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
  for (const e of run.log) {
    const key = `${f[0]}|${e.page}|${e.line}|${e.kind}|${e.answerLine}`;
    pages.add(`${f[0]}|${e.page}`);
    seen.add(key);
    const was = expected[key];
    const now = outcome(e);
    if (was === undefined) {
      unknown++;
      console.log('NOT IN ROUND 14', f, e.page, e.line, e.kind, JSON.stringify(e.answerLine).slice(0, 60), now);
    } else if (was === now) same++;
    else {
      // The same stored write, judged otherwise by the oracle; or the arbiter, the reader or placement doing otherwise.
      const onlyVerdict = was.startsWith('STORED') && now.startsWith('STORED');
      if (onlyVerdict) verdictOnly++;
      different++;
      console.log(onlyVerdict ? 'VERDICT DIFFERS' : 'DIFFERENT', f, e.page, e.line, e.kind, JSON.stringify(e.answerLine).slice(0, 60), `round 14: ${was}`, `now: ${now}`);
    }
  }
}
const missing = Object.keys(expected).filter((k) => !seen.has(k));
for (const k of missing.slice(0, 20)) console.log('MISSING', k);
console.log(`${pages.size} page runs: ${same} answers as in round 14, ${different} different (${verdictOnly} of them stored both times, the oracle's verdict alone differing), ${unknown} not in round 14, ${missing.length} of round 14's missing`);
process.exit(different || unknown || missing.length ? 1 : 0);
