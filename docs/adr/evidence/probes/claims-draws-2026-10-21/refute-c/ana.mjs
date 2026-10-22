import { readFileSync } from 'node:fs';
const f = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
function brent(x0) {
  let power = 1, lam = 1, tort = x0, hare = f(x0);
  while (tort !== hare) { if (power === lam) { tort = hare; power *= 2; lam = 0; } hare = f(hare); lam++; }
  let t = x0, h = x0; for (let i = 0; i < lam; i++) h = f(h);
  let mu = 0; while (t !== h) { t = f(t); h = f(h); mu++; }
  return [mu, lam];
}
const file = process.argv[2];
const d = JSON.parse(readFileSync(file, 'utf8'));
const ds = d.drawLog.map((x) => x.draws).sort((a, b) => a - b);
const q = (p) => ds[Math.floor(p * (ds.length - 1))];
console.log(file, 'variants', d.variants, 'draws per variant: min', ds[0], 'p10', q(0.1), 'median', q(0.5), 'p90', q(0.9), 'max', ds[ds.length - 1], 'sum', ds.reduce((a, b) => a + b, 0));
let onCycle = 0, total = 0, repeatVariants = 0, reachVariants = 0;
for (const { idx, seed0, draws } of d.drawLog) {
  const [mu, lam] = brent(seed0);
  // states drawn are x1..x_draws; x_i on cycle iff i >= mu
  const cyc = Math.max(0, draws - Math.max(mu, 1) + 1);
  onCycle += cyc; total += draws;
  if (draws >= mu) reachVariants++;
  if (mu + lam <= draws) repeatVariants++;
}
console.log('draws on a cycle state', onCycle, 'of', total, (100 * onCycle / total).toFixed(1) + '%', 'variants reaching a cycle', reachVariants, 'variants repeating a state', repeatVariants);
console.log('problems', JSON.stringify(d.problems));
