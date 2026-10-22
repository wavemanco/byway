const step = (s) => (s * 1103515245 + 12345) & 0x7fffffff;
function analyse(s0) { const seen = new Map(); let s = s0; let i = 0; while (!seen.has(s)) { seen.set(s, i); s = step(s); i++; } const mu = seen.get(s); return { tail: mu, cycle: i - mu }; }
const N = 20695; const rows = [];
for (let idx = 0; idx < N; idx++) { const r = analyse(1000 + idx * 7919); rows.push({ idx, ...r }); }
const bucket = (f) => { const b = new Array(10).fill(0); for (const r of rows) if (f(r)) b[Math.floor(r.idx / (N / 10))]++; return b; };
console.log('short cycle (any tail), by corpus decile:', bucket(r => r.cycle < 10466));
console.log('repeat within 540 draws, by decile:', bucket(r => r.tail + r.cycle <= 540));
console.log('repeat within 231 draws, by decile:', bucket(r => r.tail + r.cycle <= 231));
console.log('first idx with product > 2^53:', Math.ceil((2**53/1103515245 - 1000)/7919));
// tail length by decile (median)
const med = (a) => { a.sort((x,y)=>x-y); return a[a.length>>1]; };
const dec = Array.from({length:10},()=>[]); for (const r of rows) dec[Math.floor(r.idx/(N/10))].push(r.tail); console.log('median tail by decile:', dec.map(med));
