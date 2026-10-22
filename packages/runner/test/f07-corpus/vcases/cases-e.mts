// Round-12 verifier, hand cases E: the ADR's own worked examples, checked through the real activity.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const VH = '<style>.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>';
export const CASES = [
  { name: 'adr-read-more-stop', html: '<p>Read <a href="/x">more </a></p>', edit: setRe(/Read/, () => 'Read [more].') },
  { name: 'adr-hello-there', html: '<p><b>Hello</b><font>world</font></p>', edit: setRe(/^world$/, () => ' there') },
  { name: 'adr-sale-menu', html: '<p><b>Sale,</b><font><a href="/d">$20</a> menu</font></p>', edit: setRe(/menu/, () => '[] menu') },
  { name: 'adr-email-help', html: '<p><label>Email</label><a href="/help"> help</a> is here</p>', edit: setRe(/help/, () => 'Get [help] is here') },
  { name: 'adr-button-space-refusal', html: '<p>Go <button type="button">Send</button>now</p>', edit: setRe(/^Send$/, () => 'Send it ') },
  { name: 'adr-svg-link-two-lines', html: '<p>Hello <a href="/s"><svg width="8" height="8"></svg></a> world</p><p>Hello <font color="red">world</font>!</p>', edit: () => undefined },
  { name: 'adr-cite-block', html: '<blockquote>“Worth every penny.”<cite style="display:block">— Maya R.</cite></blockquote>', edit: setRe(/Worth/, (l) => l.replace('penny', 'pound')) },
  { name: 'adr-vh-button-send-deleted', head: VH, html: '<form><p>Order <button type="submit"><font>Send</font><span class="visually-hidden">your order</span></button> now</p></form>', edit: setRe(/^Send$/, () => '') },
  { name: 'adr-column-reverse', html: '<h1 style="display:flex;flex-direction:column-reverse">Bake <span>better bread</span></h1>', edit: setRe(/Bake/, () => 'Bake much better bread') },
  { name: 'adr-sr-rating', head: '<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}</style>', html: '<p>Rated 4.5<span class="sr-only"> out of 5</span> stars</p><p>Other</p>', edit: () => undefined },
  { name: 'adr-hidden-attr-inline', html: '<p>Sale<span hidden> ends</span> today</p>', edit: setRe(/Sale/, () => 'Sale starts today') },
  { name: 'adr-a-name-placeholder', html: '<h2><a name="top"/>Welcome</h2><p>Body</p>', edit: setRe(/Welcome/, () => 'Welcome back') },
  { name: 'adr-order-now-arrow', html: '<p>Ready? <a href="/o">Order now <i class="arrow" style="display:inline-block;width:8px;height:8px;background:#000"></i></a> and save.</p>', edit: setRe(/Ready/, () => 'Set? [Order now] and save.') },
  { name: 'adr-order-now-arrow-glued', html: '<p>Ready? <a href="/o">Order now <i class="arrow" style="display:inline-block;width:8px;height:8px;background:#000"></i></a></p>', edit: setRe(/Ready/, () => 'Ready? [Order now]!') },
];
