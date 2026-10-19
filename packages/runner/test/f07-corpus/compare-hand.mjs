// Compares a run of the hand cases (cases13.mts, hand12.mts and hand13.mts, each writing where the README's commands
// put it: <out>/cases/cases13.json, <out>/cases/<file>.json, <out>/cases-v/<file>.json) with round 13's
// (expected/round13-hand.json, from round 13's runs: 40c076c, and 5e3543f for hand13's cases-c and cases-d, which round
// 13 ran again there). The outcome of a case is cases13's outcome, or
// hand12's and hand13's kind with the oracle's verdict, or "NOT TRIED" with the lines offered when the case's answer
// does not fit the offer.
// Usage: node compare-hand.mjs <out>. Exits 1 when an outcome differs, or a case is missing or not in round 13.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node compare-hand.mjs <out folder>');
  process.exit(2);
}
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const now = {};
const c13 = path.join(dir, 'cases', 'cases13.json');
if (existsSync(c13)) for (const [k, v] of Object.entries(json(c13).out)) now[`cases13|${k}`] = v.outcome;
for (const [sub, harness] of [['cases', 'hand12'], ['cases-v', 'hand13']]) {
  const d = path.join(dir, sub);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d).filter((f) => f.endsWith('.json') && f !== 'cases13.json').sort())
    json(path.join(d, f)).forEach((e, i) => {
      now[`${harness}|${f.replace(/\.json$/, '')}|${i}|${e.name}`] = e.kind === undefined ? `NOT TRIED, offered ${JSON.stringify(e.offered)}` : `${e.kind}${e.verdict?.v ? ` ${e.verdict.v}` : ''}`;
    });
}
const expected = json(new URL('./expected/round13-hand.json', import.meta.url));
let same = 0;
let different = 0;
let verdictOnly = 0;
let unknown = 0;
for (const [k, v] of Object.entries(now)) {
  if (!(k in expected)) {
    unknown++;
    console.log('NOT IN ROUND 13', k, v);
  } else if (expected[k] === v) same++;
  else {
    // The same kind of outcome, judged otherwise by the oracle; or the arbiter, the reader or placement doing otherwise.
    const onlyVerdict = expected[k].split(' ')[0] === v.split(' ')[0] && !v.startsWith('NOT TRIED');
    if (onlyVerdict) verdictOnly++;
    different++;
    console.log(onlyVerdict ? 'VERDICT DIFFERS' : 'DIFFERENT', k, `round 13: ${expected[k]}`, `now: ${v}`);
  }
}
// A case of a file this run ran that the run does not have (cases13 counts as one file).
const fileOf = (k) => (k.startsWith('cases13|') ? 'cases13' : k.split('|').slice(0, 2).join('|'));
const ran = new Set(Object.keys(now).map(fileOf));
const missing = Object.keys(expected).filter((k) => !(k in now) && ran.has(fileOf(k)));
for (const k of missing) console.log('MISSING', k);
console.log(`${Object.keys(now).length} cases: ${same} as in round 13, ${different} different (${verdictOnly} of them the same outcome, the oracle's verdict alone differing), ${unknown} not in round 13, ${missing.length} missing (round 13 has ${Object.keys(expected).length})`);
process.exit(different || unknown || missing.length ? 1 : 0);
