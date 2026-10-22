// Round-12 verifier, hand cases G: Latin words with punctuation at an element's edge in a right-to-left page (the
// visitor read resolves a neutral by the characters beside it in its own text node).
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const AR = ' dir="rtl" lang="ar"';
export const CASES = [
  { name: 'rtl-call-paren', dir: AR, html: '<p><b>Call:&nbsp;</b><font>open</font></p>', edit: setRe(/Call/, () => 'Call:)') },
  { name: 'rtl-wifi-label', dir: AR, html: '<p><b>Wi-Fi:</b> <span>Bakery-Guest</span></p><p>مرحبا</p>', edit: setRe(/Wi-Fi/, (l) => l.replace('Wi-Fi:', 'Free Wi-Fi:')) },
  { name: 'rtl-wifi-label-split', dir: AR, html: '<p><label>Wi-Fi:</label> <span>Bakery-Guest</span></p><p>مرحبا</p>', edit: setRe(/^Wi-Fi:$/, () => 'Free Wi-Fi:') },
  { name: 'rtl-brand-colon-arabic', dir: AR, html: '<p><b>Blue Bottle:</b> قهوة مختصة</p>', edit: setRe(/Blue/, (l) => l.replace('مختصة', 'مختصة جدا')) },
  { name: 'rtl-email-label', dir: AR, html: '<p><label>Email:</label><a href="mailto:hi@cafe.jo">hi@cafe.jo</a></p>', edit: setRe(/^Email:$/, () => 'E-mail:') },
  { name: 'rtl-price-en', dir: AR, html: '<p><span>Latte</span> <b>3.5 JOD</b></p>', edit: setRe(/Latte/, (l) => l.replace('Latte', 'Iced latte')) },
];
