// Classify every refused answer (a person's list or critique a refusal names) by two refused-mode oracle passes over the
// same variants: A, the branch's reading (C1's seed directs on every run, any other on half; a seed's direction carries
// nothing), and B, the generous one (every seed directs on half the runs; a seed's direction carries what the seed takes
// in by its ports). Per answer: did it reach the delivered work (F), an AI writer (W), the person's own draft (N) or a
// decider (D) outside a candidate, on any run, given or with others left empty at random? Case 2 of ST9/ST10
// 'human-critique' (refused for its empty answer, the owner's open decision) is counted apart.
// Usage: node classify12.cjs <corpus.json> <outPrefix> --A <reportA>... --B <reportB>...
const fs = require('fs');
const args = process.argv.slice(2);
const corpusFile = args[0];
const outPrefix = args[1];
const A = [];
const B = [];
let into = null;
for (const a of args.slice(2)) {
  if (a === '--A') into = A;
  else if (a === '--B') into = B;
  else into.push(a);
}
const corpus = JSON.parse(fs.readFileSync(corpusFile, 'utf8'));
const byIdx = new Map(corpus.map((v) => [String(v.idx), v]));
const isCase2 = (msg) => /no other lens notes one|nothing after it in the gate notes one/.test(msg ?? '');
const merged = (t) => {
  const g = { ...(t.given || {}) };
  for (const [k, c] of Object.entries(t.mixed || {})) g[k] = (g[k] || 0) + c;
  return g;
};
const cls = (g) => (g.F || g.W || g.N || g.D ? 'REACHED' : g.Wc || g.Nc || g.Dc || g.Dd || g.Ddc ? 'cand-only' : g.I || g.FI || g.Ic ? 'influence-only' : 'nothing');
const load = (files) => {
  const m = new Map();
  let runs = 0;
  for (const f of files) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    runs += r.counts.runs;
    for (const row of r.rows) for (const t of row.targets) m.set(`${row.idx}|${t.stepId}`, { row, t });
  }
  return { m, runs };
};
const a = load(A);
const b = load(B);
const sum = { answers: 0, variants: new Set(), runsA: a.runs, runsB: b.runs, byClause: {}, byNearest: {}, newly: { answers: 0, A: {}, B: {} }, missingB: 0 };
const interesting = [];
for (const [k, { row, t }] of a.m) {
  sum.answers++;
  sum.variants.add(row.idx);
  const v = byIdx.get(String(row.idx));
  const ref = (v?.refusals ?? []).filter((x) => x.stepId === t.stepId);
  const clauses = [...new Set(ref.map((x) => `${x.ruleId}:${x.clause}`))].sort().join('+') || t.clause;
  const case2 = ref.some((x) => isCase2(x.message)) && !ref.some((x) => /reaches the work on no path/.test(x.message ?? ''));
  const newly = (v?.added ?? []).some((x) => ref.some((y) => x === `${y.ruleId}:${y.clause}@${y.path}`));
  const ca = cls(merged(t));
  const bt = b.m.get(k);
  if (!bt) sum.missingB++;
  const cb = bt ? cls(merged(bt.t)) : 'missing';
  const key = `${clauses}${case2 ? ' (case 2)' : ''}`;
  const e = (sum.byClause[key] ??= { answers: 0, A: {}, B: {} });
  e.answers++;
  e.A[ca] = (e.A[ca] ?? 0) + 1;
  e.B[cb] = (e.B[cb] ?? 0) + 1;
  const n = (sum.byNearest[row.nearest] ??= { answers: 0, A: {}, B: {} });
  n.answers++;
  n.A[ca] = (n.A[ca] ?? 0) + 1;
  n.B[cb] = (n.B[cb] ?? 0) + 1;
  if (newly) {
    sum.newly.answers++;
    sum.newly.A[ca] = (sum.newly.A[ca] ?? 0) + 1;
    sum.newly.B[cb] = (sum.newly.B[cb] ?? 0) + 1;
  }
  if (!case2 && (ca !== 'nothing' || cb !== 'nothing')) interesting.push({ idx: row.idx, nearest: row.nearest, muts: row.muts, stepId: t.stepId, clauses, newly, A: ca, B: cb, givenA: merged(t), givenB: bt ? merged(bt.t) : undefined, asked: t.asked });
}
sum.variants = sum.variants.size;
fs.writeFileSync(`${outPrefix}.interesting.json`, JSON.stringify(interesting));
const tally = {};
for (const x of interesting) {
  const k = `${x.nearest} A=${x.A} B=${x.B} newly=${x.newly}`;
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log(JSON.stringify({ ...sum, interestingCount: interesting.length, interestingTally: tally }, null, 1));
