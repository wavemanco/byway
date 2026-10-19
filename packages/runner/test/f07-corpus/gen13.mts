// Round 10: the round-8 verifier's generator (as round 9 ran it: gen-act-v.mts, its modes mix, x, xv with CSS
// structures, glue and links), through the REAL page VOICE activity (openCheckpoint + finishHumanStep, the runner's
// Chromium as the arbiter, the visitor read), every page kept whatever the reader or Chromium make of it. Every stored
// write is judged by the geometry oracle (oracle11.mts, no code shared with the arbiter), and every write the
// arbiter refused is placed again and judged. Usage: tsx gen10.mts seed count mode (EDGE_TYPED=1 adds typed edge spaces).
const R10 = (process.env.F07_OUT ?? (await import('node:path')).join((await import('node:os')).tmpdir(), 'byway-f07'));
const { deckLines, readPageCopy, readPageEdit, placePageEdit } = await import('../../src/copy.ts');
const { playwrightPages } = await import('../../src/pages.ts');
const H = await import('../helpers/voice-activity.ts');
const O = await import('./oracle12.mts');
const J = await import('./judge12.mts');
const fs = await import('node:fs');
let seed = Number(process.argv[2] ?? 1) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const chance = (p: number) => rnd() < p;
const mode = process.argv[4] ?? 'mix';
const N = Number(process.argv[3] ?? 300);

const WORDS = ['Fresh', 'bread', 'daily', 'Order', 'now', 'Call', 'us', 'today', 'Spring', 'sale', 'R&amp;D', 'caf&eacute;', 'menu', 'Intro', 'here', 'more', 'x', 'Name', 'price', '$20', 'open', 'late', '&nbsp;', '\u2014', '🎉', 'ok🚀'];
const PUNCT = ['', '', '', '.', '!', ',', ':', '?'];
const ws = () => (chance(0.6) ? ' ' : pick(['', '\n  ', '  ', '\n']));
const text = () => {
  const n = 1 + Math.floor(rnd() * 3);
  const w: string[] = [];
  for (let i = 0; i < n; i++) w.push(pick(WORDS) + pick(PUNCT));
  return (chance(0.3) ? ws() : '') + w.join(' ') + (chance(0.3) ? ws() : '');
};
const BLOCKS = ['div', 'p', 'section', 'blockquote', 'h2', 'h3', 'li', 'dd', 'dt', 'header', 'footer', 'nav', 'figcaption', 'address', 'center', 'article', 'aside', 'main', 'fieldset', 'summary'];
const FMT = ['b', 'i', 'em', 'strong', 'span', 'small', 'code', 'u', 's', 'mark', 'sub', 'sup', 'abbr', 'cite'];
const ODD = ['font', 'label', 'ins', 'del', 'big', 'tt', 'nobr', 'button'];
const LINKS = ['<a href="/a">', '<a href="/b">', '<a href="/c" id="k">', '<a name="n">', '<a>'];
const SOLO = ['<br>', '</br>', '<img src="i.png" alt="">', '<img src="i.png" alt="Logo">', '<wbr>', '<svg width="4" height="4"></svg>', '<svg width="4" height="4"><title/></svg>', '<svg width="4" height="4"><title>Tip</title></svg>', '<i class="icon"></i>', '<hr>', '<input>', '<!-- c -->', '</p>', '<span></span>'];
if (mode.startsWith('x')) SOLO.push('<svg width="4" height="4"><title>Tip</svg>', '<math><title/></math>', '<math><title>Mt</title></math>', '<math><title>', '<math><title><b>Mb</b></title></math>', '<span hidden> secret</span>', '<b hidden>hid</b>', '<image src="i.png">', '<video>Fallback</video>', '<svg width="4" height="4"><desc>D</desc></svg>', '<wbr>\n', '<script>x()</script>', '<details><summary>Sum</summary>Body</details>', '<svg width="9" height="9"><text y="5">Svgt</text></svg>', '<i class="icon"></i>', '<button type="button"> </button>', '<span> </span>');
if (mode.includes('v')) {
  SOLO.push('<span style="display:none">dn</span>', '<span class="sr"> sr words</span>', '<b style="display:inline-block">ib</b>', '<span style="float:right">fl</span>', '<i style="opacity:0">op</i>', '<em style="display:contents">dc</em>');
  ODD.push('span style="display:inline-block"', 'font style="display:inline-block"', 'span style="display:contents"', 'span class="sr"', 'div style="display:inline-block"', 'p style="white-space:pre-line"', 'span style="white-space:pre"');
  FMT.push('span style="text-transform:uppercase"');
}
if (process.env.NOTITLE) for (let i = SOLO.length - 1; i >= 0; i--) if (SOLO[i]!.includes('<title')) SOLO.splice(i, 1);
const STRAY = ['</p>', '</div>', '</b>', '</a>', '</span>', '</li>', '</td>', '</font>', '</label>', '<td>', '<tr>', '</em>', '</h2>'];

function node(depth: number, parent: string): { s: string; deferred: string } {
  const r = rnd();
  if (r < 0.3 || depth > 4) return { s: text(), deferred: "" };
  if (r < 0.4) return { s: pick(SOLO), deferred: "" };
  if (r < 0.43) return { s: pick(STRAY), deferred: "" };
  let open: string;
  let name: string;
  const k = rnd();
  if (k < (mode === "glue" ? 0.45 : 0.35)) { name = pick(BLOCKS); open = `<${name}${chance(0.03) ? " hidden" : ""}>`; }
  else if (k < 0.6) { const o = pick(FMT); name = o.split(' ')[0]!; open = `<${o}>`; }
  else if (k < (mode === "glue" ? 0.85 : 0.75)) { const o = pick(ODD); name = o.split(' ')[0]!; open = `<${o}${name === "font" && o === "font" ? " face=\"Arial\"" : name === "button" ? " type=\"button\"" : ""}>`; }
  else if (k < 0.97) { open = pick(LINKS); name = "a"; }
  else { name = "table"; open = "<table>"; }
  if (name === "table") return { s: `<table>${chance(0.5) ? "<tbody>" : ""}<tr>${mode.startsWith('x') && chance(0.4) ? pick(['<b>fost</b>', '<span><section>Gone</section></span>', '<font>F</font>', ' late ', '<br>', '<i class="icon"></i>']) : ''}<td>${children(depth + 1)}</td>${chance(0.5) ? `<td>${children(depth + 1)}</td>` : ""}</tr></table>`, deferred: "" };
  const kids = childList(depth + 1);
  const end = chance(mode === "glue" ? 0.82 : 0.88) ? `</${name}>` : "";
  // Misnest: this element ends after its parent ends.
  if (end && parent !== "body" && chance(0.08)) return { s: `${open}${kids.s}`, deferred: `${kids.deferred}${end}` };
  return { s: `${open}${kids.s}${end}${kids.deferred}`, deferred: "" };
}
function childList(depth: number): { s: string; deferred: string } {
  let s = "";
  let deferred = "";
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const x = node(depth, "x"); s += (chance(0.4) ? ws() : "") + x.s; deferred += x.deferred; }
  return { s, deferred };
}
const children = (depth: number) => { const x = childList(depth); return x.s + x.deferred; };
function page(): string {
  let body = "";
  const n = 2 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) { const x = node(0, "body"); body += x.s + x.deferred + (chance(0.5) ? "\n" : ""); }
  const shape = rnd();
  if (mode.startsWith('x') && shape < 0.12) return `<!doctype html><html><head><title>T</title>${pick(['Head text', '&nbsp;', ' <b>Hb</b> '])}<meta name="x"></head><body>${body}</body></html>`;
  if (shape < 0.75) return `<!doctype html><html><head><title>T</title>${mode.includes('v') ? '<style>.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>' : ''}</head><body>${body}</body></html>`;
  if (shape < 0.88) return `<!doctype html><title>T</title>${body}`;
  return `<html><head><title>T</title></head><body>${body}</body></html>`;
}

// ---- the person's edit ------------------------------------------------------------------------------------------
type S = { kind: 'out' | 'link'; text: string };
function parseLine(line: string): S[] {
  const segs: S[] = [{ kind: 'out', text: '' }];
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '\\' && i + 1 < line.length && '[]\\'.includes(line[i + 1]!)) { segs.at(-1)!.text += line[++i]; continue; }
    if (c === '[') { segs.push({ kind: 'link', text: '' }); continue; }
    if (c === ']') { segs.push({ kind: 'out', text: '' }); continue; }
    segs.at(-1)!.text += c;
  }
  return segs;
}
const esc = (t: string) => t.replace(/\\(?=[[\]\\]|$)/g, '\\\\').replace(/[[\]]/g, (m) => `\\${m}`);
const NEWW = ['new', 'Fresh', 'Big', 'today!', 'R&D', '<b>', '"quoted"', 'caf\u00e9', '🎉', 'a\u00a0b', 'x', '(soon)', '\\[1\\]', 'tom&jerry'];
function editWords(t: string): string {
  const words = t.split(' ').filter((x) => x !== '');
  const r = rnd();
  if (r < 0.25 && words.length) words[Math.floor(rnd() * words.length)] = pick(NEWW);
  else if (r < 0.45) words.splice(Math.floor(rnd() * (words.length + 1)), 0, pick(NEWW));
  else if (r < 0.6 && words.length) words.splice(Math.floor(rnd() * words.length), 1);
  else if (r < 0.75 && words.length) words[words.length - 1] += pick(['.', '!', '?', ')']);
  else if (r < 0.85 && words.length > 1) { const k = Math.floor(rnd() * (words.length - 1)); words.splice(k, 2, words[k]! + words[k + 1]!); }
  else if (r < 0.92 && words.length) words[0] = `(${words[0]}`;
  else words.push(pick(NEWW));
  return words.join(' ');
}
function editLine(display: string): string {
  const segs = parseLine(display);
  const links = segs.filter((s) => s.kind === 'link');
  if (!links.length) return esc(editWords(segs.map((s) => s.text).join('').trim()));
  const k = Math.floor(rnd() * segs.length);
  const s = segs[k]!;
  if (s.kind === 'link' && chance(0.12)) s.text = '';
  else s.text = (s.kind === 'out' && k > 0 && s.text.startsWith(' ') ? ' ' : '') + editWords(s.text.trim()) + (s.kind === 'out' && k < segs.length - 1 && (s.text.endsWith(' ') || chance(0.5)) ? ' ' : '');
  return segs.map((x) => (x.kind === 'link' ? `[${esc(x.text)}]` : esc(x.text))).join('');
}

// ---- mode "links": the round-5 open-link oracle's generator (links left open, self-closed, nested, misnested, an
// </a> inside a cell, a caption, an object, a marquee or a list box, deep nesting, name-only anchors), each link a
// unique address. Shares the generator's rnd.
let hid = 0;
let unclear = false;
const OWORDS = ['Fresh', 'bread', 'six', 'Order', 'now', 'caf&eacute;', 'R&amp;D', 'Call', 'us', 'today'];
const SP = [' ', ' ', '', '\n  '];
const owords = (n = 1 + Math.floor(rnd() * 2)) => Array.from({ length: n }, () => pick(OWORDS)).join(pick([' ', ' ', '\n ']));
function oinline(depth: number): string {
  const r = rnd();
  const h = `/t${hid++}`;
  if (r < 0.25 || depth > 2) return owords();
  if (r < 0.35) { const f = pick(['em', 'b', 'span', 'strong']); return `<${f}>${oinline(depth + 1)}</${f}>`; }
  if (r < 0.47) return `<a href="${h}">${oinline(depth + 1)}</a>`;
  if (r < 0.57) return `<a href="${h}">${oinline(depth + 1)}`;
  if (r < 0.63) return `<a href="${h}"/>${pick(SP)}${owords()}`;
  if (r < 0.73) return `<a href="${h}">${owords()} <a href="/t${hid++}">${owords()}</a> ${owords()}</a>`;
  if (r < 0.81) { const f = pick(['b', 'em', 'span']); return `<${f}>${owords()} <a href="${h}">${owords()}</${f}> ${owords()}</a>`; }
  if (r < 0.85) return `${owords()}</a>`;
  if (r < 0.9) return `<i class="icon"></i>`;
  const f = pick(['em', 'b']);
  return `<${f}>${oinline(depth + 1)}</${f}>`;
}
function or5block(): string {
  const h = `/t${hid++}`;
  const r = rnd();
  const k = 3 + Math.floor(rnd() * 9);
  if (r < 0.12) return `<div><a href="${h}">${owords()}<table><tr><td>${owords()}</a> ${owords()}</td></tr></table>${owords()}</div>`;
  if (r < 0.2) return `<p>${owords()} <a href="${h}">${owords()}<table><caption>${owords()}</a>${owords()}</caption></table>${owords()}</a> ${owords()}</p>`;
  if (r < 0.3) { const x = pick(['object', 'marquee']); return `<p>${owords()} <a href="${h}">${owords()}<${x}>${owords()}</a>${owords()}</${x}>${owords()}</a> ${owords()}</p>`; }
  if (r < 0.36) return `<p>${owords()} <a href="${h}">${owords()}<select><option>${owords()}</a>${owords()}</select>${owords()}</a> ${owords()}</p>`;
  if (r < 0.55) return `<p>${owords()} <a href="${h}">${owords()}${Array.from({ length: k }, () => `<div>${owords()}`).join('')}</a> ${owords()}${'</div>'.repeat(k)}</p>`;
  if (r < 0.7) return `<h2><a name="n${hid}"/>${owords()}</h2>`;
  if (r < 0.8) return `<p>${owords()} <a name="m${hid}">${owords()}</a> ${owords()}</p>`;
  if (r < 0.9) return `<a href="${h}"><table><tr><td>${owords()}</td></tr></table></a>`;
  return `<div><a href="${h}">${owords()}<div>${owords()}</a> ${owords()}</div></div>`;
}
function oblock(): string {
  if (rnd() < 0.3) return or5block();
  const r = rnd();
  if (unclear && r < 0.12) return `<table><tr><td>${owords()}</td><td>${oinline(1)}</td></tr></table>`;
  if (unclear && r < 0.2) return `<select><option>${owords()}</option></select>`;
  const tag = pick(['p', 'h2', 'div', 'li']);
  const n = 1 + Math.floor(rnd() * 3);
  let s = rnd() < 0.3 ? pick(SP) : '';
  for (let i = 0; i < n; i++) s += oinline(0) + pick(SP);
  if (!/\S/.test(s.replace(/<[^>]*>/g, ''))) s += ' Fresh';
  return tag === 'li' ? `<ul><li>${s}</li></ul>` : `<${tag}>${s}</${tag}>`;
}
function olPage(): string {
  hid = 0;
  unclear = rnd() < 0.3;
  return `<!doctype html><html><head><title>T</title></head><body>${Array.from({ length: 1 + Math.floor(rnd() * 4) }, oblock).join('\n')}</body></html>`;
}

// ---- mode lv: the round-9 verifier's CSS layout/visibility generator, as the round-10 verifier ran it (gen-v10.mts) ----
const LV_WORDS = ['Fresh', 'bread', 'daily', 'Order', 'now', 'Call', 'us', 'today', 'Spring', 'sale', 'R&amp;D', 'caf&eacute;', 'menu', 'Intro', 'here', 'more', 'Name', 'price', '$20', 'open', 'late', '\u2014', '🎉'];
const LV_PUNCT = ['', '', '', '.', '!', ',', ':', '?'];
const LV_ws = () => (chance(0.7) ? ' ' : pick(['', '\n  ', '  ', '\n']));
const LV_text = () => {
  const n = 1 + Math.floor(rnd() * 3);
  const w: string[] = [];
  for (let i = 0; i < n; i++) w.push(pick(LV_WORDS) + pick(LV_PUNCT));
  return (chance(0.3) ? LV_ws() : '') + w.join(' ') + (chance(0.3) ? LV_ws() : '');
};
const LV_BLOCKS = ['div', 'p', 'section', 'h2', 'h3', 'li', 'footer', 'nav', 'article'];
const LV_FMT = ['b', 'i', 'em', 'strong', 'span', 'small', 'code', 'mark'];
// Containers whose own style lays out their content (the deck reads them by tag only).
const LV_LAYOUT = [
  'p style="display:flex"', 'p style="display:flex;gap:8px"', 'div style="display:flex;align-items:center"', 'h3 style="display:flex;gap:6px;flex-wrap:wrap"',
  'a href="/f" style="display:inline-flex;align-items:center"', 'p style="display:grid;grid-template-columns:auto auto auto;justify-content:start"',
  'p style="display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:4px"', 'li style="display:flex"', 'button type="button" style="display:flex;gap:4px"',
  'p style="white-space:pre"', 'p style="white-space:pre-wrap"', 'p dir="rtl"', 'p style="text-transform:uppercase"', 'p class="pre"',
  'div style="height:24px;overflow:hidden;width:220px"', 'p style="width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"',
  'p style="width:220px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden"', 'ol', 'ul',
];
// Inline pieces with a style the deck does not read.
const LV_STYLED = [
  'span style="float:right"', 'span style="float:left"', 'span style="position:absolute;left:0"', 'span style="order:-1"', 'span style="display:table-cell"',
  'span style="display:inline-block;padding:0 4px"', 'span style="display:inline-block"', 'em style="display:contents"', 'span class="sr-only"', 'span class="visually-hidden"',
  'span class="screen-reader-text"', 'span class="cp-hide"', 'span style="filter:opacity(0)"', 'span style="opacity:0.02"', 'span style="color:transparent"',
  'span style="font-size:0"', 'b style="text-transform:capitalize"', 'span class="dot"', 'span style="display:block"', 'span style="margin-left:-0.3em"', 'span style="letter-spacing:-0.4em"',
];
const LV_SOLO = ['<br>', '<wbr>', '<img src="i.png" alt="">', '<svg width="8" height="8"></svg>', '<i class="icon"></i>', '<span class="sr-only"> (opens in a new tab)</span>', '<span aria-hidden="true">&rarr;</span>', '\t'];
const LV_LINKS = ['<a href="/a">', '<a href="/b">', '<a href="/c" id="k">'];
const LV_STYLE = `<style>
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
.screen-reader-text{border:0;clip:rect(1px,1px,1px,1px);clip-path:inset(50%);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;width:1px;word-wrap:normal!important}
.cp-hide{position:absolute;clip-path:polygon(0 0,0 0,0 0)}
.dot::before{content:"\\2022  "} .pre::before{content:"New: "}
</style>`;

function LV_node(depth: number): string {
  const r = rnd();
  if (r < 0.3 || depth > 3) return LV_text();
  if (r < 0.37) return pick(LV_SOLO);
  const k = rnd();
  if (k < 0.2) { const b = pick(LV_BLOCKS); return `<${b}>${LV_kids(depth + 1)}</${b}>`; }
  if (k < 0.38) { const f = pick(LV_FMT); return `<${f}>${LV_kids(depth + 1)}</${f}>`; }
  if (k < 0.6) { const s = pick(LV_STYLED); const n = s.split(' ')[0]!; return `<${s}>${LV_kids(depth + 1)}</${n}>`; }
  if (k < 0.82) {
    const s = pick(LV_LAYOUT);
    const n = s.split(' ')[0]!;
    if (n === 'ol' || n === 'ul') return `<${n}>${Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => `<li>${LV_kids(depth + 1)}</li>`).join('')}</${n}>`;
    return `<${s}>${LV_kids(depth + 1)}</${n}>`;
  }
  if (k < 0.97) return `${pick(LV_LINKS)}${LV_kids(depth + 1)}</a>`;
  return `<table><tr><td>${LV_kids(depth + 1)}</td>${chance(0.5) ? `<td>${LV_kids(depth + 1)}</td>` : ''}</tr></table>`;
}
function LV_kids(depth: number): string {
  let s = '';
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) s += (chance(0.5) ? LV_ws() : '') + LV_node(depth);
  return s;
}
function LV_page(): string {
  let body = '';
  const n = 2 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) body += LV_node(0) + (chance(0.5) ? '\n' : '');
  return `<!doctype html><html><head><title>T</title>${LV_STYLE}</head><body>${body}</body></html>`;
}



// ---- mode atk: the round-11 verifier's attack generator: motion beside glued boxes, pre-line breaks, RTL digits,
// letter-spaced labels, generated labels, chips, contents, drop caps, tickers, JS-moved staggered items.
const A_WORDS = ['Fresh', 'bread', 'daily', 'Order', 'now', 'Call', 'us', 'today', 'Spring', 'sale', 'menu', 'Intro', 'here', 'more', 'Name', 'price', '$20', 'open', 'late', 'Sign', 'in', 'From', '$29', '/month', 'New'];
const A_AR = ['مخبز', 'خبز', 'طازج', 'يوميا', 'اطلب', 'الآن', 'عام', '١٩٩٨', '٢٠٢٥', '٠١٢٣', 'من', '٩'];
const A_HE = ['לחם', 'טרי', 'כל', 'בוקר', 'הזמינו', 'עכשיו', '2025', '7:00'];
const aw = (n = 1 + Math.floor(rnd() * 3)) => Array.from({ length: n }, () => pick(A_WORDS)).join(' ');
const A_STYLE = `<style>
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes floaty{0%,100%{transform:translate(0,0)}50%{transform:translate(3px,-3px)}}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.pulse{display:inline-block;animation:pulse 2s infinite}.bounce{display:inline-block;animation:bounce 1s infinite}.floaty{display:inline-block;animation:floaty 3s infinite}
.chip{display:inline-block;padding:2px 8px;background:#eee;border-radius:9px}
.eyebrow{letter-spacing:.3em;text-transform:uppercase;font-size:12px}
.new::before{content:"New: "}.tick::after{content:" \\2713"}
.drop::first-letter{float:left;font-size:3em;line-height:1;margin-right:6px}
.ticker{overflow:hidden;white-space:nowrap;width:600px}.ticker>div{display:inline-block;animation:tick 20s linear infinite}
.js-move{display:inline-block;transform:translateY(30px)}
</style>`;
const A_SCRIPT = `<script>(() => { const xs = [...document.querySelectorAll('.js-move')]; xs.forEach((x, i) => { const start = performance.now() + i * 400; const step = (t) => { const k = Math.min(1, Math.max(0, (t - start) / 900)); x.style.transform = 'translateY(' + (30 * (1 - k)) + 'px)'; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); })();</script>`;
function A_item(): string {
  const r = rnd();
  const mv = pick(['pulse', 'bounce', 'floaty', 'js-move', '', '', 'chip']);
  const cls = mv ? ` class="${mv}"` : '';
  if (r < 0.15) return `<a href="/${pick(['a', 'b', 'c'])}"${cls}>${aw()}</a>`;
  if (r < 0.3) return `<label${cls}>${aw()}</label>`;
  if (r < 0.45) return `<strong${cls}>${aw(1)}</strong>`;
  if (r < 0.55) return `<button type="button"${cls}>${aw()}</button>`;
  if (r < 0.7) return `<span${cls}>${aw()}</span>`;
  return aw();
}
function A_block(): string {
  const r = rnd();
  const sp = () => pick(['', '', ' ', ' ', '\n  ']);
  if (r < 0.28) {
    const gap = pick(['', '', 'gap:6px;', 'gap:0;']);
    const n = 2 + Math.floor(rnd() * 3);
    const tag = pick(['p', 'div', 'li', 'h3']);
    const body = Array.from({ length: n }, () => A_item()).join('').replace(/></g, () => `>${sp()}<`);
    return tag === 'li' ? `<ul><li style="display:flex;${gap}align-items:baseline">${body}</li></ul>` : `<${tag} style="display:${pick(['flex', 'inline-flex', 'grid;grid-auto-flow:column;justify-content:start'])};${gap}align-items:baseline">${body}</${tag}>`;
  }
  if (r < 0.38) return `<${pick(['address', 'p'])} style="white-space:${pick(['pre-line', 'pre-wrap'])}">${Array.from({ length: 2 + Math.floor(rnd() * 2) }, () => aw()).join('\n')}</${pick(['address', 'p'])}>`;
  if (r < 0.46) return `<p dir="rtl" lang="ar">${Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => pick(A_AR)).join(' ')}${pick(['', '.', '!', '؟'])}</p>`;
  if (r < 0.5) return `<p dir="rtl" lang="he">${Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => pick(A_HE)).join(' ')}${pick(['', '.', '!'])}</p>`;
  if (r < 0.56) return `<p class="eyebrow">${aw()}</p>`;
  if (r < 0.62) return `<h2 class="${pick(['new', 'tick'])}">${aw()}</h2>`;
  if (r < 0.68) return `<p>${aw(1)}:${sp()}<span class="chip">${aw(1)}</span><span class="chip">${aw(1)}</span></p>`;
  if (r < 0.72) return `<p class="drop">${aw(4)}</p>`;
  if (r < 0.76) return `<div class="ticker"><div>${aw(5)} · ${aw(5)} · </div></div>`;
  if (r < 0.82) return `<p>${aw()} <span style="display:contents"><b>${aw(1)}</b> ${aw(1)}</span> ${aw(1)}</p>`;
  if (r < 0.88) return `<p>${aw()}${sp()}<span class="${pick(['pulse', 'bounce', 'js-move'])}">${aw(1)}</span>${sp()}${aw(1)}</p>`;
  return `<${pick(['p', 'h2', 'li'])}>${aw()}${pick(['', ' ', '<br>'])}${aw()}</${pick(['p', 'h2', 'li'])}>`;
}
function ATK_page(): string {
  const n = 2 + Math.floor(rnd() * 4);
  const body = Array.from({ length: n }, A_block).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>T</title>${A_STYLE}</head><body>${body}${/js-move/.test(body) ? A_SCRIPT : ''}</body></html>`;
}

// ---- round 11 driver: the real page VOICE activity, every write judged by the geometry oracle ----------------------
const OUT = process.env.OUT ?? `${R10}/out/gen12-${mode}${process.env.EDGE_TYPED === '1' ? '-edge' : ''}-${process.argv[2]}`;
const EDGE_TYPED = process.env.EDGE_TYPED === '1';
let seed2 = (Number(process.argv[2] ?? 1) ^ 0x9e3779b9) >>> 0;
const rnd2 = () => { seed2 = (seed2 + 0x6d2b79f5) >>> 0; let t = seed2; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const edged = (l: string) => (EDGE_TYPED ? `${rnd2() < 0.2 ? ' ' : ''}${l}${rnd2() < 0.2 ? ' ' : ''}` : l);
const PAGES = playwrightPages();
type Outcome = { kind: 'STORED' | 'REFUSED' | 'NOTHING' | 'THREW'; offered: string[]; prompt?: string; message?: string; written?: string };
let session: { html: string; b: any; q: any; offered: string[]; prompt?: string; threw?: string } | undefined;
async function voice(html: string, answerOf: (offered: string[]) => string | undefined): Promise<Outcome> {
  if (session?.html !== html) {
    session?.b.close();
    const b = await H.voiceBench([], { pages: PAGES });
    session = { html, b, q: undefined, offered: [] };
    try {
      const run = await H.benchRun(b, 'web-page');
      const id = await H.putWork(b, 'web-page', html);
      session.q = await H.VoiceQuestion.open(b, run, id);
      session.offered = (session.q.offered ?? '').split(String.fromCharCode(10));
      session.prompt = session.q.prompt;
    } catch (e) {
      session.threw = `OPEN: ${(e as Error).constructor.name}: ${(e as Error).message}`;
    }
  }
  const { b, q, offered, prompt } = session;
  if (session.threw) return { kind: 'THREW', offered, message: session.threw };
  const a = answerOf(offered);
  if (a === undefined) return { kind: 'NOTHING', offered, prompt };
  try {
    const r = await q.answer(a);
    if (!r.artifactId) return { kind: 'NOTHING', offered, prompt };
    return { kind: 'STORED', offered, prompt, written: await b.store.artifacts.getText(r.artifactId) };
  } catch (e) {
    const err = e as Error;
    return { kind: err.constructor.name === 'AnswerRejected' ? 'REFUSED' : 'THREW', offered, prompt, message: `${err.constructor.name}: ${err.message}` };
  }
}
/** Each changed line's words put in place of its old ones in the page's words before (lines found in deck order). */
function judgeMany(before: { title: string; words: string[] }, after: { title: string; words: string[] }, offered: string[], answer: string[]): string {
  const sq = (s: string) => s.replace(/[ \t\n\f\r]+/g, ' ').trim();
  const changed = offered.map((l, i) => i > 0 && sq(answer[i] ?? '') !== sq(l));
  if (sq(answer[0] ?? '') !== sq(offered[0] ?? '')) {
    if (O.lineWords(answer[0]!).join(' ') !== after.title.replace(/\s+/g, ' ').trim()) return 'DIFF:title';
  } else if (before.title !== after.title) return 'DIFF:title';
  const spans: [number, number, string[]][] = [];
  let cur = 0;
  for (let i = 1; i < offered.length; i++) {
    const o = O.lineWords(offered[i]!);
    if (!o.length) continue;
    let at = -1;
    for (let k = cur; k + o.length <= before.words.length; k++) {
      if (o.every((t, q) => before.words[k + q] === t)) {
        at = k;
        break;
      }
    }
    if (at < 0) {
      if (changed[i]) return 'PRE';
      continue;
    }
    if (changed[i]) spans.push([at, at + o.length, O.lineWords(answer[i]!)]);
    cur = at + o.length;
  }
  const want: string[] = [];
  let k = 0;
  for (const [a, b, n] of spans) {
    want.push(...before.words.slice(k, a), ...n);
    k = b;
  }
  want.push(...before.words.slice(k));
  if (want.length === after.words.length && want.every((t, i) => t === after.words[i])) return 'ok';
  // Said apart: the same characters with words parted otherwise (run together or split), or other characters.
  return want.join('') === after.words.join('') ? 'DIFF:spacing' : 'DIFF:words';
}
let lastWhy: string | undefined;
const stats: Record<string, number> = {};
const inc = (k: string, n = 1) => (stats[k] = (stats[k] ?? 0) + n);
const ex: Record<string, unknown[]> = {};
const keep = (k: string, x: unknown) => ((ex[k] ??= []).length < 12 && ex[k]!.push(x));
const t0 = Date.now();
for (let it = 0; it < N; it++) {
  const html = mode === 'links' ? olPage() : mode === 'lv' ? LV_page() : mode === 'atk' ? ATK_page() : page();
  inc('pages');
  try {
    const full = deckLines(readPageCopy(html));
    inc('deckLines', full.length);
    let before: any;
    let counted = false;
    for (let e = 0; e < 3; e++) {
      let answer: string[] = [];
      const o = await voice(html, (offered) => {
        if (!counted) {
          counted = true;
          inc('linesOffered', offered.length);
          inc('linesNotOffered', full.length - offered.length);
        }
        answer = offered.map((l, i) => {
          if (i === 0) return chance(0.1) ? `${l} & <co>` : l;
          const r = rnd();
          if (r < 0.55) return l;
          if (r < 0.67) return '';
          return edged(editLine(l));
        });
        return answer.join('\n');
      });
      inc('edits');
      if (o.kind === 'NOTHING') {
        inc('nothing');
        continue;
      }
      if (o.kind === 'THREW') {
        inc('threw');
        keep('threw', { html, answer, m: o.message });
        continue;
      }
      if (o.kind === 'REFUSED') {
        const m = o.message!.replace(/^AnswerRejected: /, '');
        if (/^byway could not put line|^byway could not check/.test(m)) {
          inc('arbiterRefused');
          before ??= await O.visit(html);
          // The page the arbiter refused: placed again, the lines not offered left out.
          const notOffered = new Set<number>();
          let j = 0;
          full.forEach((l: string, x: number) => {
            if (j < o.offered.length && o.offered[j] === l) j++;
            else notOffered.add(x);
          });
          const ed = readPageEdit(readPageCopy(html, notOffered), answer.join('\n'));
          const placed = ed.ok ? placePageEdit(html, ed, notOffered) : undefined;
          const v = placed && !placed.problems.length ? (await (async () => { const jj = J.judge(before, await O.visit(placed.page), o.offered, answer); lastWhy = jj.why; return jj.v; })()) : 'not replayed';
          inc(`arbiterRefused, write judged ${v}`);
          keep(`arbiterRefused:${v}`, { html, answer, offered: o.offered, m, written: placed?.page });
          fs.appendFileSync(`${OUT}.refusals.jsonl`, JSON.stringify({ html, offered: o.offered, answer, m, oracle: v, why: lastWhy, written: placed?.page }) + '\n');
        } else {
          inc('refusedOther');
          if (/must read exactly|The page, read again|Text outside your changed lines|must be empty|is not where the element/.test(m)) { inc('refused by the in-code verifier'); keep('verifier', { html, answer, offered: o.offered, m }); }
          inc(`R: ${m.replace(/[Ll]ine \d+/g, 'line N').replace(/"[^"]*"/g, '"…"').replace(/\(to [^)]*\)/g, '(to …)').slice(0, 110)}`);
        }
        continue;
      }
      inc('stored');
      before ??= await O.visit(html);
      const v = (await (async () => { const jj = J.judge(before, await O.visit(o.written!), o.offered, answer); lastWhy = jj.why; return jj.v; })());
      inc(`stored, judged ${v}`);
      if (v !== 'ok') {
        keep(`stored:${v}`, { html, answer, offered: o.offered, written: o.written });
        fs.appendFileSync(`${OUT}.judged.jsonl`, JSON.stringify({ html, offered: o.offered, answer, written: o.written, judged: v, why: lastWhy }) + '\n');
      }
    }
  } catch (err) {
    inc('harnessThrew');
    keep('harnessThrew', { html, e: String((err as Error).stack ?? err) });
  }
  if (it % 25 === 24) fs.writeFileSync(`${OUT}.json`, JSON.stringify({ seed: process.argv[2], mode, n: it + 1, seconds: Math.round((Date.now() - t0) / 1000), stats, ex }, null, 1));
}
fs.writeFileSync(`${OUT}.json`, JSON.stringify({ seed: process.argv[2], mode, n: N, done: true, seconds: Math.round((Date.now() - t0) / 1000), stats, ex }, null, 1));
await O.closeOracle();
await PAGES.close();
process.exit(0);
