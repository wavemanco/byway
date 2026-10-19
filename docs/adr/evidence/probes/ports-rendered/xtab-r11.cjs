// Cross-tabulate the round-11 verification's admitted answers (its admitted-mode oracle with templates rendered,
// o12-adm-*.json, and read by ports, o12-admB-*.json) against this branch's verdict on the same 13,779 variants
// (rv11-*.json): every answer main admits, by what it reaches, and whether the branch refuses it by an answer clause,
// refuses its variant otherwise (COMPOSED-PROMPT), or admits it.
// Usage: node xtab-r11.cjs
const fs = require('fs');
const V = 'C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/ports-rendered/';
const R = 'C:/Users/arvik/AppData/Local/Temp/byway-fixes/scratch/verify-semantics-2-r11/';
const verdict = new Map();
for (let k = 0; k < 6; k++) for (const v of JSON.parse(fs.readFileSync(`${V}rv11-${k}.json`, 'utf8'))) verdict.set(String(v.idx), v);
const ANSWER = /critique-unapplied|critique-per-candidate|human-critique/;
const cls = (t) => {
  const g = { ...(t.given || {}) };
  for (const [k, c] of Object.entries(t.mixed || {})) g[k] = (g[k] || 0) + c;
  return g.F ? 'F' : g.W || g.N || g.D ? 'WND' : g.Wc || g.Nc || g.Dc || g.Dd || g.Ddc ? 'cand' : g.I || g.FI || g.Ic ? 'inf' : 'none';
};
const tab = (prefix) => {
  const out = { answers: 0, missing: 0, table: {} };
  for (let k = 0; k < 8; k++) {
    const r = JSON.parse(fs.readFileSync(`${R}${prefix}-${k}.json`, 'utf8'));
    for (const row of r.rows) {
      const v = verdict.get(String(row.idx));
      for (const t of row.targets) {
        out.answers++;
        if (!v) {
          out.missing++;
          continue;
        }
        const answerRef = v.refusals.some((x) => ANSWER.test(x.clause) && x.stepId === t.stepId);
        const b = answerRef ? 'refused-answer' : v.branchOk ? 'admitted' : 'variant-refused-otherwise';
        const c = cls(t);
        out.table[c] ??= {};
        out.table[c][b] = (out.table[c][b] ?? 0) + 1;
      }
    }
  }
  return out;
};
console.log(JSON.stringify({ rendered: tab('o12-adm'), byPorts: tab('o12-admB') }, null, 1));
