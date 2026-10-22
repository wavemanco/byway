import fs from 'node:fs';
const step = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
function analyse(s0) { const seen = new Map(); let s = s0; let i = 0; while (!seen.has(s)) { seen.set(s, i); s = step(s); i++; } const mu = seen.get(s); return { mu, lam: i - mu }; }
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const N = d.n; let tot = 0, onCyc = 0, onBig = 0; const rep = [];
const ns = [...d.draws].sort((a, b) => a - b); const q = (p) => ns[Math.floor(p * (ns.length - 1))];
const info = [];
for (let idx = 0; idx < N; idx++) {
  const D = d.draws[idx]; tot += D; const r = analyse(1000 + idx * 7919);
  // draws are s_1..s_D; s_k is on the cycle iff k >= mu
  const c = Math.max(0, D - Math.max(r.mu, 1) + 1); onCyc += c; if (r.lam === 10466) onBig += c;
  info[idx] = { D, ...r, reps: d.reps[idx] };
  if (d.reps[idx] > 0) rep.push(idx);
}
console.log('variants', N, 'draws/variant p10', q(0.1), 'p50', q(0.5), 'p90', q(0.9), 'max', ns.at(-1), 'total', tot);
console.log('draws on a cycle', onCyc, (100 * onCyc / tot).toFixed(2) + '%', 'on the 10,466 cycle', onBig, (100 * onBig / tot).toFixed(2) + '%');
const byLam = {}; for (const i of rep) byLam[info[i].lam] = (byLam[info[i].lam] ?? 0) + 1;
console.log('variants with a repeated state:', rep.length, JSON.stringify(byLam), 'deciles', JSON.stringify(Array.from({ length: 10 }, (_, k) => rep.filter((i) => Math.floor(i / (N / 10)) === k).length)));
console.log('blocking kinds:', JSON.stringify(d.blocking));
for (const [k, p] of Object.entries(d.problems)) if (!k.endsWith('(info)')) for (const i of p.variants) console.log(' ', k, 'count', p.count, 'idx', i, JSON.stringify(info[i]));
