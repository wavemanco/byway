// Round-12 verifier, hand cases F: brackets and parentheses in right-to-left text (the bidi algorithm pairs brackets,
// rule N0), and the stacked-fade slide again under the improved oracle.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
export const CASES = [
  { name: 'rtl-latin-footnote', dir: ' dir="rtl" lang="ar"', html: '<p>خبز طازج كل يوم</p><table><tr><td>today</td></tr></table>', edit: setRe(/^today$/, () => 'today [1]'.replace('[', '\\[').replace(']', '\\]')) },
  { name: 'rtl-ar-footnote-digit', dir: ' dir="rtl" lang="ar"', html: '<p>خبز طازج كل يوم</p>', edit: setRe(/خبز/, (l) => `${l} \\[١\\]`) },
  { name: 'rtl-ar-paren-latin', dir: ' dir="rtl" lang="ar"', html: '<p>قهوة مختصة من بلو بوتل</p>', edit: setRe(/قهوة/, () => 'قهوة مختصة من (Blue Bottle)') },
  { name: 'rtl-he-paren-new', dir: ' dir="rtl" lang="he"', html: '<p>לחם מחמצת טרי</p>', edit: setRe(/לחם/, () => 'לחם מחמצת טרי (חדש!)') },
  { name: 'rtl-he-price-paren', dir: ' dir="rtl" lang="he"', html: '<p>קפה קר ₪18</p>', edit: setRe(/קפה/, () => 'קפה קר ₪18 (גדול ₪22)') },
  { name: 'rtl-ar-latin-paren-number', dir: ' dir="rtl" lang="ar"', html: '<p>اتصل بنا</p>', edit: setRe(/اتصل/, () => 'اتصل بنا (+962 6 500 0000)') },
  { name: 'ltr-he-paren', html: '<p>Our bakery in Tel Aviv</p>', edit: setRe(/bakery/, () => 'Our bakery (המאפייה) in Tel Aviv') },
  {
    name: 'stacked-fade-edit-slide2-again', head: '<style>.st{position:relative;height:40px}.st>p{position:absolute;inset:0;margin:0;opacity:0;transition:opacity .4s}.st>p.on{opacity:1}</style>',
    html: '<div class="st"><p class="on">Best bread in town</p><p>Lovely staff</p><p>Great coffee</p></div><script>(()=>{const s=[...document.querySelectorAll(".st>p")];let i=0;setInterval(()=>{s[i].classList.remove("on");i=(i+1)%s.length;s[i].classList.add("on")},2000)})()</script>',
    edit: setRe(/^Lovely staff$/, () => 'L'),
  },
];
