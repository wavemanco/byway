// The round-9 "Sign intoday" flex reproduction, with a pulsing (endless transform) call to action, and variants.
const set = (o: string[], i: number, v: string) => o.map((x, k) => (k === i ? v : x));
const repl = (o: string[], s: string, f: (x: string) => string) => { const i = o.findIndex((x) => x.includes(s)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const PULSE = '<style>@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}.pulse{display:inline-block;animation:pulse 2s ease-in-out infinite}</style>';
export const CASES = [
  { name: 'signin-static', html: '<p style="display:flex;justify-content:center">Already have an account? <a href="/login" style="margin-left:4px">Sign in</a></p>', edit: (o: string[]) => repl(o, 'Already', () => 'Already have an account? [Sign in] today') },
  { name: 'signin-pulse', html: PULSE + '<p style="display:flex;justify-content:center">Already have an account? <a class="pulse" href="/login" style="margin-left:4px">Sign in</a></p>', edit: (o: string[]) => repl(o, 'Already', () => 'Already have an account? [Sign in] today') },
  { name: 'cta-pulse-flex', html: PULSE + '<div style="display:flex;align-items:center;gap:0"><a class="pulse" href="/order" style="background:#b45309;color:#fff;padding:12px 20px;border-radius:8px">Order now</a></div>', edit: (o: string[]) => repl(o, 'Order', () => '[Order now] and save') },
  { name: 'price-pulse', html: PULSE + '<p style="display:flex;align-items:baseline;font-size:24px">From <strong class="pulse">$29</strong></p>', edit: (o: string[]) => repl(o, 'From', () => 'From $29 per month') },
  { name: 'badge-bounce-li', html: '<style>@keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}.new{display:inline-block;animation:b 1s infinite;color:#b45309}</style><ul><li style="display:flex"><span class="new">New</span><span>Sourdough</span></li></ul>', edit: (o: string[]) => repl(o, 'New', () => 'New in: Sourdough') },
];
