const f = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
function brent(x0) {
  let power = 1, lam = 1, tort = x0, hare = f(x0);
  while (tort !== hare) { if (power === lam) { tort = hare; power *= 2; lam = 0; } hare = f(hare); lam++; }
  let t = x0, h = x0; for (let i = 0; i < lam; i++) h = f(h);
  let mu = 0; while (t !== h) { t = f(t); h = f(h); mu++; }
  return [mu, lam];
}
const N = 20695; const D = 231;
let on = 0, tot = 0;
const cur = []; for (let i = 0; i < N; i++) cur.push(1000 + i * 7919);
for (let i = 0; i < N; i++) { const [mu] = brent(cur[i]); on += Math.max(0, D - Math.max(mu, 1) + 1); tot += D; }
console.log('cycle share at 231 draws each', (100 * on / tot).toFixed(2) + '%');
for (let k = 1; k <= 540; k++) { for (let i = 0; i < N; i++) cur[i] = f(cur[i]); if ([50, 231, 540].includes(k)) console.log('distinct states at draw', k, new Set(cur).size); }
// is the 10,466 cycle reached from seed 1 after 689? check the claim "cycled after 10,466 draws" for typical seeds: first repeat index = mu + lam
