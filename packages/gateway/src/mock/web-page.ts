import { escapeHtml, titleFrom } from './extract.ts';
import { int, pick, rng, sample, type Rand } from './seed.ts';

/**
 * Demo-mode landing pages: one self-contained HTML file (inline CSS, an inline SVG illustration, system font stacks so
 * nothing loads from the network). A seed picks the palette, type pairing, layout and copy, so the four seeded
 * candidates of C1 look like four different directions. They deliberately avoid the tells the protocol sweeps for:
 * no purple gradient hero, no eyebrow label on every section, no grid of identical cards, two typefaces at most.
 */

interface Palette {
  name: string;
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  line: string;
  art: [string, string, string];
}

const PALETTES: readonly Palette[] = [
  { name: 'paper', bg: '#f6f1e7', surface: '#fffaf0', ink: '#1d1b16', muted: '#5f5a4f', accent: '#b4532a', onAccent: '#fffaf0', line: '#e3dccd', art: ['#e9c46a', '#b4532a', '#2a4d3e'] },
  { name: 'forest', bg: '#10201b', surface: '#162b24', ink: '#edf3ef', muted: '#a8bcb1', accent: '#e3b04b', onAccent: '#14211c', line: '#25392f', art: ['#e3b04b', '#6f9a7e', '#d97b52'] },
  { name: 'harbor', bg: '#eef2f5', surface: '#ffffff', ink: '#0e2233', muted: '#4c6072', accent: '#0f6e8c', onAccent: '#ffffff', line: '#d5dee6', art: ['#9fc6d6', '#0f6e8c', '#f2a65a'] },
  { name: 'clay', bg: '#f3e9e2', surface: '#fbf5f0', ink: '#2a1d17', muted: '#6d5a50', accent: '#3d5a40', onAccent: '#f6efe9', line: '#e4d4c8', art: ['#d9a07a', '#3d5a40', '#a4483a'] },
  { name: 'ink', bg: '#121212', surface: '#1b1b1b', ink: '#f2efe9', muted: '#a6a29a', accent: '#ff6b3d', onAccent: '#121212', line: '#2b2b2b', art: ['#ff6b3d', '#f2efe9', '#5c5c5c'] },
  { name: 'citrus', bg: '#fbfbf4', surface: '#ffffff', ink: '#1b1f14', muted: '#565c4a', accent: '#4f6b00', onAccent: '#fbfbf4', line: '#e6e8d6', art: ['#d7e36a', '#4f6b00', '#f08a4b'] },
];

const TYPE_PAIRS = [
  { display: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif", body: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", displayWeight: 600 },
  { display: "'Avenir Next', 'Segoe UI', system-ui, sans-serif", body: "Charter, 'Bitstream Charter', Georgia, serif", displayWeight: 700 },
  { display: "ui-serif, Georgia, 'Times New Roman', serif", body: "ui-sans-serif, system-ui, sans-serif", displayWeight: 500 },
] as const;

const LAYOUTS = ['split', 'stacked', 'editorial'] as const;
type Layout = (typeof LAYOUTS)[number];

const BRANDS = ['Fieldnote', 'Harbor & Pine', 'Lumen', 'Northloaf', 'Kestrel', 'Mill Street', 'Tidewell', 'Oakline', 'Saltbox', 'Juniper Hall', 'Quarry', 'Blue Hour'];

const PROMISES = [
  'Fewer steps, better results, and nothing you have to babysit.',
  'Thoughtfully made, quick to start, and honest about what it costs.',
  'Built around the way you already work, not the other way round.',
  'Small enough to understand in a minute. Solid enough to rely on for years.',
];

const POINTS = [
  { title: 'Start in an afternoon', body: 'Set up takes minutes, not a project plan. Bring what you have and we will meet you there.' },
  { title: 'Made to last', body: 'Every detail is chosen to hold up to daily use, so you are not replacing it next season.' },
  { title: 'Plain pricing', body: 'One clear price, no tiers to decode and no surprises at renewal.' },
  { title: 'A person on the other end', body: 'Questions reach someone who knows the product, usually within the hour.' },
  { title: 'Works with what you use', body: 'It fits alongside your existing tools instead of asking you to replace them.' },
  { title: 'Quiet by default', body: 'No streaks, badges or nudges. It does the job and gets out of the way.' },
];

const STEPS = ['Tell us what you need', 'See a first version the same day', 'Adjust until it fits', 'Use it every day'];
const CTAS = ['Get started', 'Book a visit', 'Join the first batch', 'See it in action'];

function illustration(rand: Rand, p: Palette): string {
  const [a, b, c] = p.art;
  const shapes: string[] = [];
  shapes.push(`<rect width="480" height="360" fill="${p.surface}"/>`);
  shapes.push(`<circle cx="${int(rand, 120, 360)}" cy="${int(rand, 90, 150)}" r="${int(rand, 56, 84)}" fill="${a}"/>`);
  for (let i = 0; i < 3; i++) {
    const y = 210 + i * 40;
    const amp = int(rand, 18, 36);
    shapes.push(`<path d="M0 ${y} C 120 ${y - amp}, 200 ${y + amp}, 320 ${y - amp / 2} S 440 ${y + amp}, 480 ${y} V 360 H 0 Z" fill="${i % 2 ? c : b}" opacity="${(0.92 - i * 0.12).toFixed(2)}"/>`);
  }
  return `<svg viewBox="0 0 480 360" role="img" aria-label="Abstract landscape illustration" xmlns="http://www.w3.org/2000/svg">${shapes.join('')}</svg>`;
}

export interface PageOptions {
  seed: number;
  /** The user's problem or brief; becomes the headline. */
  subject: string;
}

export function renderPage(o: PageOptions): string {
  const rand = rng(o.seed);
  const p = pick(rand, PALETTES);
  const type = pick(rand, TYPE_PAIRS);
  const layout: Layout = pick(rand, LAYOUTS);
  const brand = pick(rand, BRANDS);
  const headline = titleFrom(o.subject, 'A calmer way to get it done');
  const promise = pick(rand, PROMISES);
  const points = sample(rand, POINTS, 3);
  const cta = pick(rand, CTAS);
  const art = illustration(rand, p);
  const e = escapeHtml;

  const hero =
    layout === 'editorial'
      ? `<section class="hero editorial"><h1>${e(headline)}</h1><div class="lede"><p>${e(promise)}</p><a class="button" href="#start">${e(cta)}</a></div><figure class="art" data-slot="hero">${art}</figure></section>`
      : `<section class="hero ${layout}"><div class="copy"><h1>${e(headline)}</h1><p class="lede">${e(promise)}</p><a class="button" href="#start">${e(cta)}</a></div><figure class="art" data-slot="hero">${art}</figure></section>`;

  const features = points
    .map((pt, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${e(pt.title)}</h3><p>${e(pt.body)}</p></li>`)
    .join('');
  const steps = STEPS.map((s) => `<li>${e(s)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(brand)} | ${e(headline)}</title>
<style>
:root{--bg:${p.bg};--surface:${p.surface};--ink:${p.ink};--muted:${p.muted};--accent:${p.accent};--on-accent:${p.onAccent};--line:${p.line};--display:${type.display};--body:${type.body};--measure:34rem}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:400 1.0625rem/1.6 var(--body)}
a{color:inherit}
.wrap{max-width:72rem;margin:0 auto;padding:0 1.5rem}
header{display:flex;justify-content:space-between;align-items:center;padding:1.5rem 0}
.brand{font:${type.displayWeight} 1.25rem/1 var(--display);letter-spacing:-.01em;text-decoration:none}
nav a{margin-left:1.5rem;color:var(--muted);text-decoration:none;font-size:.95rem}
nav a:hover{color:var(--ink)}
h1,h2,h3{font-family:var(--display);font-weight:${type.displayWeight};letter-spacing:-.02em;margin:0}
h1{font-size:clamp(2.4rem,5.5vw,4.4rem);line-height:1.04}
h2{font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.15;margin-bottom:1.25rem}
h3{font-size:1.2rem;margin:.35rem 0 .4rem}
.lede{font-size:1.2rem;color:var(--muted);max-width:var(--measure)}
.hero{padding:3.5rem 0 4.5rem;display:grid;gap:2.5rem;align-items:center}
.hero.split{grid-template-columns:1.1fr 1fr}
.hero.stacked{text-align:center;justify-items:center}
.hero.stacked .lede{margin-left:auto;margin-right:auto}
.hero.editorial{grid-template-columns:1fr 1fr;align-items:end}
.hero.editorial h1{grid-column:1 / -1;font-size:clamp(2.8rem,7vw,5.6rem);max-width:16ch}
.copy>*+*{margin-top:1.25rem}
.button{display:inline-block;background:var(--accent);color:var(--on-accent);padding:.85rem 1.4rem;border-radius:.5rem;text-decoration:none;font-weight:600;margin-top:1.5rem}
.button:hover{filter:brightness(1.08)}
.button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.art{margin:0;border-radius:1rem;overflow:hidden;border:1px solid var(--line);background:var(--surface)}
.art svg,.art img{display:block;width:100%;height:auto}
.hero.stacked .art{max-width:44rem;width:100%}
.points{list-style:none;margin:0;padding:3rem 0;display:grid;grid-template-columns:repeat(3,1fr);gap:2.5rem;border-top:1px solid var(--line)}
.num{font:600 .85rem/1 var(--body);color:var(--accent);font-variant-numeric:tabular-nums}
.points p{color:var(--muted);margin:0}
.how{padding:3.5rem 0;border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1.4fr;gap:2.5rem}
.how ol{margin:0;padding-left:1.25rem;font-size:1.15rem}
.how li+li{margin-top:.6rem}
.gallery{padding:3rem 0;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));gap:1.5rem}
.gallery figure{margin:0}
.gallery img{width:100%;height:auto;border-radius:.75rem;display:block}
.closing{padding:4rem 0 5rem;border-top:1px solid var(--line);text-align:center}
.closing p{color:var(--muted);margin:0 auto;max-width:var(--measure)}
footer{padding:2rem 0 3rem;color:var(--muted);font-size:.9rem;border-top:1px solid var(--line)}
@media (max-width:760px){.hero.split,.hero.editorial,.how{grid-template-columns:1fr}.points{grid-template-columns:1fr}nav a{margin-left:1rem}}
@media (prefers-reduced-motion:no-preference){.button{transition:filter .15s ease}}
</style>
</head>
<body>
<div class="wrap">
<header><a class="brand" href="#">${e(brand)}</a><nav><a href="#how">How it works</a><a href="#start">Contact</a></nav></header>
<main>
${hero}
<ul class="points">${features}</ul>
<section class="how" id="how"><h2>How it works</h2><ol>${steps}</ol></section>
<section class="closing" id="start"><h2>Ready when you are</h2><p>${e(brand)} is ready for you today. Tell us a little about what you need and we will take it from there.</p><a class="button" href="#start">${e(cta)}</a></section>
</main>
<footer>&copy; 2026 ${e(brand)}. Made with care.</footer>
</div>
</body>
</html>`;
}

/**
 * A worker's fix turn in demo mode: the page comes back with its revision counter bumped and a little more breathing
 * room, so successive versions differ and stay valid documents.
 */
export function revisePage(html: string, iteration: number): string {
  const n = iteration + 1;
  const meta = `<meta name="byway-revision" content="${n}">`;
  let out = /<meta name="byway-revision" content="\d+">/.test(html)
    ? html.replace(/<meta name="byway-revision" content="\d+">/, meta)
    : html.replace(/<head>/i, `<head>\n${meta}`);
  out = out.replace(/--measure:(\d+(?:\.\d+)?)rem/, (_, v: string) => `--measure:${Math.min(40, Number(v) + 1)}rem`);
  return out;
}

/** ASSET integration in demo mode: the first image replaces the hero illustration; the rest form a gallery. */
export function integrateImages(html: string, images: { url: string; alt: string }[]): string {
  if (!images.length) return html;
  const [first, ...rest] = images;
  let out = html;
  if (first) {
    const img = `<img src="${escapeHtml(first.url)}" alt="${escapeHtml(first.alt)}">`;
    out = out.replace(/(<figure class="art" data-slot="hero">)[\s\S]*?(<\/figure>)/, `$1${img}$2`);
    if (out === html) rest.unshift(first);
  }
  if (rest.length) {
    const gallery = `<section class="gallery">${rest.map((i) => `<figure><img src="${escapeHtml(i.url)}" alt="${escapeHtml(i.alt)}"></figure>`).join('')}</section>`;
    out = /<\/main>/i.test(out) ? out.replace(/<\/main>/i, `${gallery}\n</main>`) : out.replace(/<\/body>/i, `${gallery}\n</body>`);
  }
  return out;
}
