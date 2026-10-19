// Summarise an admitted-mode oracle report: per target, whether it reached the delivered work (F), a writer (W),
// the person's draft (N), a decider (D), only inside candidates (Wc/Nc/Dc), or nothing.
const fs = require('fs');
const files = process.argv.slice(2);
const byNear = {};
const out = { targets: 0, reachedF: 0, reachedWND: 0, candOnly: 0, influenceOnly: 0, nothing: 0, examples: [] };
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const row of r.rows) for (const t of row.targets) {
    out.targets++;
    const g = { ...(t.given || {}) };
    for (const [k, c] of Object.entries(t.mixed || {})) g[k] = (g[k] || 0) + c;
    const F = !!g.F, WND = !!(g.W || g.N || g.D);
    const cand = !!(g.Wc || g.Nc || g.Dc || g.Dd || g.Ddc);
    const inf = !!(g.I || g.FI);
    let cls;
    if (F) { out.reachedF++; cls = 'F'; }
    else if (WND) { out.reachedWND++; cls = 'WND'; }
    else if (cand) { out.candOnly++; cls = 'cand'; }
    else if (inf) { out.influenceOnly++; cls = 'inf'; }
    else { out.nothing++; cls = 'none'; }
    const k = `${row.nearest}:${cls}`;
    byNear[k] = (byNear[k] || 0) + 1;
    if (cls !== 'F' && out.examples.length < 40) out.examples.push({ file: f.split('/').pop(), idx: row.idx, nearest: row.nearest, muts: row.muts, step: t.stepId, cls, asked: t.asked, given: t.given, mixed: t.mixed });
  }
}
console.log(JSON.stringify({ ...out, byNear, examples: out.examples.slice(0, 12) }, null, 1));
