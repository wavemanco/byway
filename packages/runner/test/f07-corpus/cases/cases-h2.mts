const set = (o: string[], i: number, v: string) => o.map((x, k) => (k === i ? v : x));
const repl = (o: string[], s: string, f: (x: string) => string) => { const i = o.findIndex((x) => x.includes(s)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const ADDR = '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>';
const HOURS = '<p style="white-space:pre-line">Mon–Fri 7am–6pm\nSat 8am–4pm\nSun closed</p>';
export const CASES = [
  { name: 'preline-road', html: ADDR, edit: (o: string[]) => repl(o, 'Baker', (x) => x.replace('Street', 'Road')) },
  { name: 'preline-sat', html: HOURS, edit: (o: string[]) => repl(o, 'Mon', (x) => x.replace('Sat', 'Saturday')) },
  { name: 'preline-4pm', html: HOURS, edit: (o: string[]) => repl(o, 'Mon', (x) => x.replace('4pm', '5pm')) },
  { name: 'preline-london', html: ADDR, edit: (o: string[]) => repl(o, 'Baker', (x) => x.replace('London', 'Leeds')) },
  { name: 'flex-bounce-mid', html: '<style>@keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.bn{display:inline-block;animation:b 1s infinite}</style><p style="display:flex;font-size:20px"><label>Order</label><label class="bn">now</label></p>', edit: (o: string[]) => repl(o, 'now', () => ' today') },
  { name: 'flex-bounce-del', html: '<style>@keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.bn{display:inline-block;animation:b 1s infinite}</style><p style="display:flex;font-size:20px"><label>Order</label><label>more</label><label class="bn">now</label></p>', edit: (o: string[]) => repl(o, 'more', () => '') },
];
