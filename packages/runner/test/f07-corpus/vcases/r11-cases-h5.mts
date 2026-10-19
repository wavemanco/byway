const set = (o: string[], i: number, v: string) => o.map((x, k) => (k === i ? v : x));
const repl = (o: string[], s: string, f: (x: string) => string) => { const i = o.findIndex((x) => x.includes(s)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const GSAP = '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>';
export const CASES = [
  { name: 'gsap-stagger-space', html: `<h2 style="display:flex;font-size:40px"><span class="w">Order</span><span class="w">now</span></h2>${GSAP}<script>gsap.from(".w",{y:40,opacity:0,duration:1.2,stagger:0.8})</script>`, edit: (o: string[]) => repl(o, 'Order', () => 'Order now') },
  { name: 'static-space', html: `<h2 style="display:flex;font-size:40px"><span class="w">Order</span><span class="w">now</span></h2>`, edit: (o: string[]) => repl(o, 'Order', () => 'Order now') },
  { name: 'gsap-stagger-append', html: `<p style="display:flex;align-items:baseline;font-size:24px"><strong class="w">$29</strong><span class="w">/month</span></p>${GSAP}<script>gsap.from(".w",{x:-30,opacity:0,duration:1,stagger:0.7})</script>`, edit: (o: string[]) => repl(o, '$29', () => '$29/month billed yearly') },
];
