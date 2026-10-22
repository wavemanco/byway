const step = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
// from seed 1 (the module's initial seed): when does it first repeat?
function analyse(s0, cap = 2_000_000) {
  const seen = new Map(); let s = s0; let i = 0;
  while (!seen.has(s) && i < cap) { seen.set(s, i); s = step(s); i++; }
  const mu = seen.get(s); return { tail: mu, cycle: i - mu, first: s };
}
console.log('seed 1:', analyse(1));
// cycle membership: canonical id = min state in cycle
function cycleId(s0) { const { tail, cycle } = analyse(s0); let s = s0; for (let i = 0; i < tail; i++) s = step(s); let m = s; let t = s; for (let i = 0; i < cycle; i++) { t = step(t); if (t < m) m = t; } return { tail, cycle, id: m }; }
const N = 20695;
const res = []; const cyc = new Map();
for (let idx = 0; idx < N; idx++) { const r = cycleId(1000 + idx * 7919); res.push(r); const k = `${r.cycle}:${r.id}`; cyc.set(k, (cyc.get(k) ?? 0) + 1); }
console.log('cycles (len:id -> seeds):', [...cyc].sort((a,b)=>b[1]-a[1]));
const tails = res.map(r => r.tail).sort((a,b)=>a-b);
const q = (p) => tails[Math.floor(p * (tails.length - 1))];
console.log('tail p10', q(0.1), 'median', q(0.5), 'p90', q(0.9), 'min', tails[0], 'max', tails.at(-1));
for (const D of [231, 540, 1000, 2000]) {
  let repeatWithin = 0, cycleDraws = 0;
  for (const r of res) { if (r.tail + r.cycle <= D) repeatWithin++; cycleDraws += Math.max(0, D - r.tail); }
  console.log(`D=${D}: seeds repeating a state within D draws=${repeatWithin} (${(100*repeatWithin/N).toFixed(2)}%), share of draws on a cycle=${(100*cycleDraws/(N*D)).toFixed(2)}%`);
}
// distinct trajectories after 50 draws (state after 50 draws)
const after = new Set(); for (let idx = 0; idx < N; idx++) { let s = 1000 + idx * 7919; for (let i = 0; i < 50; i++) s = step(s); after.add(s); }
console.log('distinct states after 50 draws:', after.size);
// merging: how many distinct states across all variants' first 231 draws vs N*231
const all = new Set(); for (let idx = 0; idx < N; idx++) { let s = 1000 + idx * 7919; for (let i = 0; i < 231; i++) { s = step(s); all.add(s); } }
console.log('distinct states in first 231 draws of all variants:', all.size, 'of', N*231);
