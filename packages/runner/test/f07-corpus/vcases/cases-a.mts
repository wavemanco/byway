// Round-12 verifier, hand cases A: the expected-text model and round 12's new rules.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const find = (o: string[], re: RegExp) => o.findIndex((l) => re.test(l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = find(o, re); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const SR = '<style>.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}</style>';
export const CASES = [
  // --- repeated lines and words that occur elsewhere
  { name: 'rep-2nd-of-3', html: '<p><a href="/a">Learn more</a></p><p><a href="/b">Learn more</a></p><p><a href="/c">Learn more</a></p>', edit: (o: string[]) => { const i = o.indexOf('Learn more', o.indexOf('Learn more') + 1); return set(o, i, 'Read the story'); } },
  { name: 'rep-words-elsewhere', html: '<h2>Order now</h2><p>Order now today and save</p><p>now</p>', edit: setRe(/^now$/, () => 'Order now') },
  { name: 'rep-swap-lines', html: '<p>Alpha</p><p>Beta</p>', edit: (o: string[]) => { const a = o.indexOf('Alpha'), b = o.indexOf('Beta'); const x = [...o]; x[a] = 'Beta'; x[b] = 'Alpha'; return x; } },
  { name: 'rep-same-text-inline-lines', html: '<p><font>open</font> <font>open</font> <font>open</font></p>', edit: (o: string[]) => { const i = o.indexOf('open', o.indexOf('open') + 1); return set(o, i, 'shut'); } },
  // --- deleted lines
  { name: 'del-mid-chip', html: '<p>Tags: <span style="display:inline-block;padding:0 6px;background:#eee">New</span><font style="display:inline-block;padding:0 6px;background:#eee">tech</font><span style="display:inline-block;padding:0 6px;background:#eee">fast</span></p>', edit: setRe(/tech/, () => '') },
  { name: 'del-glued-inline-mid', html: '<p><b>Big</b><font>Mid</font><i>End</i></p>', edit: setRe(/Mid/, () => '') },
  { name: 'del-flex-item', html: '<p style="display:flex"><span>Fresh</span><font>bread</font><span>daily</span></p>', edit: setRe(/bread/, () => '') },
  { name: 'del-line-before-br', html: '<p>First line<br>Second line<br>Third line</p>', edit: setRe(/^Second/, () => '') },
  { name: 'del-last-in-cell', html: '<table><tr><td>Name<font>Extra</font></td><td>Price</td></tr></table>', edit: setRe(/^Extra$/, () => '') },
  // --- whitespace-only and edge spaces
  { name: 'ws-only-change', html: '<p><b>Hello</b><font>world</font></p>', edit: setRe(/^world$/, () => ' world ') },
  { name: 'ws-typed-lead-glued-font', html: '<p><b>Hello</b><font>world</font></p>', edit: setRe(/^world$/, () => ' brave world') },
  { name: 'ws-typed-trail-flex', html: '<p style="display:flex"><font>Already have an account?</font><a href="/l">Sign in</a></p>', edit: setRe(/account/, () => 'Already registered? ') },
  { name: 'ws-many-spaces', html: '<p>Fresh bread daily</p>', edit: setRe(/Fresh/, () => 'Fresh   bread\tdaily now') },
  // --- text-transform / ::before / display:contents / inline-block / tables / lists
  { name: 'tt-uppercase', html: '<p style="text-transform:uppercase">Our story</p>', edit: setRe(/Our story/, () => 'our new story') },
  { name: 'before-content', html: '<style>.p::before{content:"$"}</style><p class="p">20</p>', edit: setRe(/^20$/, () => '$25') },
  { name: 'contents-glue', html: '<p>Fresh <span style="display:contents"><b>bread</b> daily</span> here</p>', edit: setRe(/Fresh/, (l) => l.replace('daily', 'every day')) },
  { name: 'ib-typed-space-between-chips', html: '<p>Tags: <span style="display:inline-block">New</span><span style="display:inline-block">tech</span></p>', edit: setRe(/Tags/, () => 'Tags: New tech') },
  { name: 'ib-chips-glue-word', html: '<p>Tags: <span style="display:inline-block;padding:0 6px;background:#eee">New</span><span style="display:inline-block;padding:0 6px;background:#eee">tech</span></p>', edit: setRe(/Tags/, () => 'Tags: Newtechnology') },
  { name: 'table-cell-typed-space', html: '<table><tr><td>Croissant</td><td>£3</td></tr></table>', edit: setRe(/Croissant/, () => 'Butter croissant ') },
  { name: 'list-items', html: '<ul><li>One</li><li>Two</li><li>Three</li></ul>', edit: setRe(/^Two$/, () => 'Two and a half') },
  { name: 'br-in-line-typed', html: '<p>Call us<br>today</p>', edit: setRe(/^Call us$/, () => 'Call us now ') },
  { name: 'wbr-append', html: '<p>Supercali<wbr>fragilistic word</p>', edit: setRe(/Supercali/, () => 'Supercalifragilistic word here') },
  { name: 'wbr-newline-after', html: '<p>Hello<wbr>\nworld</p><p>Other</p>', edit: setRe(/^Other$/, () => 'Others') },
  // --- pre / white-space
  { name: 'pre-line-addr-insert', html: '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>', edit: setRe(/Crumb/, (l) => l.replace('12', '14 Old')) },
  { name: 'pre-line-addr-delete-word', html: '<address style="white-space:pre-line">Crumb &amp; Co.\n12 Baker Street\nLondon NW1 6XE</address>', edit: setRe(/Crumb/, (l) => l.replace('London ', '')) },
  { name: 'pre-wrap-multispace', html: '<p style="white-space:pre-wrap">Name:    Value   here</p>', edit: setRe(/Name/, (l) => l.replace('Value', 'Price')) },
  { name: 'pre-span-break-in-link', html: '<p><span style="white-space:pre">Open </span><a href="/x" style="white-space:pre">late\nSpring</a> sale</p>', edit: setRe(/sale/, (l) => l.replace('sale', 'deals')) },
  // --- emoji / combining / ZWJ
  { name: 'emoji-zwj-swap', html: '<p>Team 👨‍👩‍👧 joy</p>', edit: setRe(/Team/, () => 'Team 👨‍👩‍👦 joy') },
  { name: 'emoji-flag-append', html: '<p>Made in 🇺🇸</p>', edit: setRe(/Made/, () => 'Made in 🇺🇸🇬🇧') },
  { name: 'combining-decomposed', html: '<p>Cafe menu</p>', edit: setRe(/Cafe/, () => 'Café menu') },
  { name: 'nbsp-edge-out', html: '<p><b>Price:&nbsp;</b><font>$20</font></p>', edit: setRe(/Price/, () => 'Cost:') },
  { name: 'nbsp-mid-keep', html: '<p>10&nbsp;km away from town</p>', edit: setRe(/km/, (l) => l.replace('town', 'the city')) },
  // --- sr-only adjacency
  { name: 'sr-between-lines-typed', html: '<p><font>Rated</font><span class="sr-only"> by guests</span><font>4.9</font></p>', head: SR, edit: setRe(/^Rated$/, () => 'Rated highly ') },
  { name: 'sr-between-lines-glue', html: '<p><font>Rated</font><span class="sr-only"> by guests </span><font>4.9</font></p>', head: SR, edit: setRe(/^Rated$/, () => 'Rating') },
];
