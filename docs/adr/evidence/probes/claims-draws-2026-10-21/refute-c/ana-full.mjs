import { readFileSync } from 'node:fs';
const f = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
function brent(x0) {
  let power = 1, lam = 1, tort = x0, hare = f(x0);
  while (tort !== hare) { if (power === lam) { tort = hare; power *= 2; lam = 0; } hare = f(hare); lam++; }
  let t = x0, h = x0; for (let i = 0; i < lam; i++) h = f(h);
  let mu = 0; while (t !== h) { t = f(t); h = f(h); mu++; }
  return [mu, lam];
}
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const ds = d.drawLog.map((x) => x.draws).sort((a, b) => a - b);
const q = (p) => ds[Math.floor(p * (ds.length - 1))];
console.log('variants', d.variants, 'logged', d.drawLog.length, 'draws/variant min', ds[0], 'p10', q(0.1), 'median', q(0.5), 'p90', q(0.9), 'p99', q(0.99), 'max', ds[ds.length - 1], 'total', ds.reduce((a, b) => a + b, 0));
let on = 0, tot = 0; const rep = [], reach = []; const repByLam = {};
const info = new Map();
for (const { idx, seed0, draws } of d.drawLog) {
  const [mu, lam] = brent(seed0);
  info.set(idx, { mu, lam, draws });
  on += Math.max(0, draws - Math.max(mu, 1) + 1); tot += draws;
  if (draws >= mu) reach.push(idx);
  if (mu + lam <= draws) { rep.push(idx); repByLam[lam] = (repByLam[lam] ?? 0) + 1; }
}
console.log('draws on a cycle state', on, 'of', tot, (100 * on / tot).toFixed(2) + '%');
console.log('variants reaching a cycle', reach.length, 'variants whose draws repeat a state', rep.length, 'by cycle length', JSON.stringify(repByLam));
const posq = [0, 0, 0, 0]; for (const i of rep) posq[Math.min(3, Math.floor(4 * i / d.variants))]++;
console.log('repeating variants by corpus quarter', posq);
for (const [k, p] of Object.entries(d.problems)) {
  const vs = p.variants; const r = vs.filter((i) => rep.includes(i)).length;
  console.log(k, 'count', p.count, 'variants', vs.length, 'of which repeating-stream', r, k.endsWith('(info)') ? '' : 'NON-INFO idx: ' + JSON.stringify(vs.slice(0, 10).map((i) => [i, info.get(i)])));
}
