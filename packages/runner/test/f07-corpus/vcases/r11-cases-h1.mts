// Hand cases, round-11 verifier: (2) attacks on the expected text, and suspected false refusals.
const set = (o: string[], i: number, v: string) => o.map((x, k) => (k === i ? v : x));
const find = (o: string[], s: string) => o.findIndex((x) => x.includes(s));
const repl = (o: string[], s: string, f: (x: string) => string) => { const i = find(o, s); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
export const CASES = [
  // RTL with Arabic-Indic digits, and with European digits
  { name: 'rtl-arabic-indic', html: '<main dir="rtl" lang="ar"><h1>مخبز النور</h1><p>افتتحنا المخبز عام ١٩٩٨ في القاهرة</p><p>اتصل بنا: ٠١٢٣٤٥</p></main>', edit: (o: string[]) => repl(o, 'القاهرة', (x) => x.replace('القاهرة', 'الإسكندرية')) },
  { name: 'rtl-european-digits', html: '<main dir="rtl" lang="ar"><h1>مخبز النور</h1><p>افتتحنا المخبز عام 1998 في القاهرة</p></main>', edit: (o: string[]) => repl(o, 'القاهرة', (x) => x.replace('القاهرة', 'الإسكندرية')) },
  { name: 'rtl-hebrew-punct', html: '<main dir="rtl" lang="he"><h1>מאפיית השחר</h1><p>לחם טרי כל בוקר!</p><p>פתוח: א׳–ו׳, 7:00–14:00</p></main>', edit: (o: string[]) => repl(o, 'לחם', (x) => x.replace('טרי', 'חם')) },
  // pre-line address: a number next to a kept break
  { name: 'preline-nw2', html: '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>', edit: (o: string[]) => repl(o, 'Baker', (x) => x.replace('NW1', 'NW2')) },
  { name: 'preline-14', html: '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>', edit: (o: string[]) => repl(o, 'Baker', (x) => x.replace('12', '14')) },
  { name: 'preline-co', html: '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>', edit: (o: string[]) => repl(o, 'Baker', (x) => x.replace('Co.', 'Company')) },
  { name: 'preline-hours', html: '<p class="hours" style="white-space:pre-line">Mon–Fri 7am–6pm\nSat 8am–4pm\nSun closed</p>', edit: (o: string[]) => repl(o, 'Mon', (x) => x.replace('6pm', '7pm')) },
  // Letter-spaced uppercase eyebrow
  { name: 'eyebrow', html: '<p style="letter-spacing:.3em;text-transform:uppercase;font-size:12px;color:#b45309">Our story</p><h2>Baked since 1998</h2>', edit: (o: string[]) => repl(o, 'Our story', () => 'Our long history') },
  { name: 'eyebrow-wide', html: '<p style="letter-spacing:0.5em;font-size:11px">ABOUT US</p><h2>Baked since 1998</h2>', edit: (o: string[]) => repl(o, 'ABOUT', () => 'WHO WE ARE') },
  // Repeated lines: change only the second "Learn more"
  { name: 'repeat-2nd', html: '<div class="card"><h3>Bread</h3><a href="/bread">Learn more</a></div><div class="card"><h3>Cakes</h3><a href="/cakes">Learn more</a></div><div class="card"><h3>Coffee</h3><a href="/coffee">Learn more</a></div>', edit: (o: string[]) => { const ks = o.map((x, k) => (x.includes('Learn more') ? k : -1)).filter((k) => k >= 0); return set(o, ks[1]!, '[See our cakes]'); } },
  // Words that also occur elsewhere; delete one copy
  { name: 'dup-words-delete', html: '<h1>Fresh bread daily</h1><p>Fresh bread</p><p>Fresh bread daily</p>', edit: (o: string[]) => set(o, 3, '') },
  { name: 'swap-lines', html: '<h2>First</h2><p>Second</p>', edit: (o: string[]) => [o[0]!, 'Second', 'First'] },
  // Inline-block chips
  { name: 'chips-edit', html: '<style>.chip{display:inline-block;padding:2px 8px;margin-right:4px;background:#eee;border-radius:9px}</style><p>Tags: <span class="chip">New</span><span class="chip">tech</span></p>', edit: (o: string[]) => repl(o, 'Tags', (x) => x.replace('New', 'Old')) },
  // Covered word: an absolutely positioned badge over the end of a heading
  { name: 'cover-badge', html: '<div style="position:relative;width:520px"><h2 style="margin:0;font-size:28px">Our sourdough recipe</h2><span style="position:absolute;left:250px;top:0;width:270px;height:40px;background:#fff;border:2px solid #b45309;color:#b45309;font-weight:bold;padding:4px">NEW</span></div>', edit: (o: string[]) => repl(o, 'sourdough', () => 'Our sourdough recipe is famous') },
  // z-index behind a background with no stacking context between
  { name: 'zbehind-edit', html: '<section style="background:#fff;padding:20px"><p>Front <span style="position:relative;z-index:-1">behind</span> end</p></section>', edit: (o: string[]) => repl(o, 'Front', () => 'Front hidden words end') },
  // Text coloured as its background
  { name: 'same-colour-edit', html: '<div style="background:#123;color:#fff;padding:10px"><p>Hello <span style="color:#123">ghost</span> world</p></div>', edit: (o: string[]) => repl(o, 'Hello', () => 'Hello dear world') },
  // ::before label beside the page's own text; <q>
  { name: 'before-label', html: '<style>h2.new::before{content:"New: ";color:#b45309}</style><h2 class="new">Spring menu</h2>', edit: (o: string[]) => repl(o, 'Spring', () => 'Summer menu') },
  { name: 'q-quotes', html: '<p>She said <q>hello</q> today</p>', edit: (o: string[]) => repl(o, 'She said', (x) => x.replace('hello', 'goodbye')) },
  // display: contents, tables, lists, br, wbr
  { name: 'contents', html: '<p>Open <span style="display:contents"><b>every</b> day</span> at 7</p>', edit: (o: string[]) => repl(o, 'Open', () => 'Open every single day at 7') },
  { name: 'table-cell', html: '<table><tr><td>Mon</td><td>9–5</td></tr><tr><td>Tue</td><td>9–5</td></tr></table>', edit: (o: string[]) => { const k = o.findIndex((x) => x === '9–5'); return set(o, k, '10–6'); } },
  { name: 'ol-delete', html: '<ol><li>First step</li><li>Second step</li><li>Third step</li></ol>', edit: (o: string[]) => repl(o, 'Second', () => '') },
  { name: 'br-delete', html: '<p>Line one<br>Line two<br>Line three</p>', edit: (o: string[]) => repl(o, 'Line two', () => '') },
  { name: 'br-glue', html: '<p>Line one<br>Line two</p>', edit: (o: string[]) => repl(o, 'Line one', () => 'Line one and') },
  { name: 'wbr-edit', html: '<p>Supercali<wbr>fragilistic</p>', edit: (o: string[]) => repl(o, 'Super', () => 'Superduper') },
  { name: 'emoji-edit', html: '<p>Team 🎉 party today</p>', edit: (o: string[]) => repl(o, 'Team', () => 'Team 👨‍👩‍👧 party 🇺🇸 tonight') },
  // Typed trailing space beside a flex neighbour whose node an endless transform animation moves (the read's "measured at different samples" rule)
  { name: 'flex-bounce-trail', html: '<style>@keyframes b{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}.bn{display:inline-block;animation:b 1s infinite}</style><p style="display:flex;font-size:20px"><label>Order</label><label class="bn">now</label></p>', edit: (o: string[]) => repl(o, 'Order', () => 'Buy ') },
  { name: 'flex-static-trail', html: '<p style="display:flex;font-size:20px"><label>Order</label><label>now</label></p>', edit: (o: string[]) => repl(o, 'Order', () => 'Buy ') },
  // A line next to a glued flex neighbour: new words glued
  { name: 'flex-signin', html: '<p style="display:flex;justify-content:center">Already have an account? <a href="/login" style="margin-left:4px">Sign in</a></p>', edit: (o: string[]) => repl(o, 'Already', () => 'Already have an account? [Sign in] today') },
];
