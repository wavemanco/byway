// Round-12 verifier, hand cases B: round 12's new rules (moving items, stacked slides, RTL, glued punctuation into a
// word's slot) and the read's conditions (reduced motion, one instant).
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const KF = `<style>
@keyframes nudgeL{0%{transform:translateX(-14px)}8%,100%{transform:none}}
@keyframes nudgeR{0%{transform:translateX(14px)}8%,100%{transform:none}}
@keyframes wig{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
.nl{display:inline-block;animation:nudgeL 3s infinite}.nr{display:inline-block;animation:nudgeR 3s infinite}.wig{display:inline-block;animation:wig 1s infinite}
@media (prefers-reduced-motion: no-preference){ .mflex{display:flex} .mtick{animation:t 10s linear infinite} }
@keyframes t{from{transform:translateX(0)}to{transform:translateX(-50%)}}
</style>`;
export const CASES = [
  // an item whose animation's first keyframe stands it apart from its neighbour (the read's last instant is that keyframe)
  { name: 'nudge-left-link-typed-after', head: KF, html: '<p style="display:flex">Already have an account?<a class="nl" href="/l">Sign in</a></p>', edit: setRe(/Sign in/, (l) => `${l} today`) },
  { name: 'nudge-right-word-typed-before', head: KF, html: '<p style="display:flex"><span class="nr">From</span><b>$29</b></p>', edit: setRe(/^From$/, () => 'From only ') },
  { name: 'wiggle-link-typed-after', head: KF, html: '<p style="display:flex">Already have an account?<a class="wig" href="/l">Sign in</a></p>', edit: setRe(/Sign in/, (l) => `${l} today`) },
  // the read runs with reduced motion: a layout only visitors without that preference get
  { name: 'reduced-motion-flex', head: KF, html: '<p class="mflex">Already have an account? <a href="/l">Sign in</a></p>', edit: setRe(/Sign in/, (l) => `${l} today`) },
  { name: 'reduced-motion-flex-nopref-oracle', head: KF, html: '<p class="mflex">Already have an account? <a href="/l">Sign in</a></p>', edit: setRe(/Sign in/, (l) => `${l} today`), motion: 'reduce' },
  // stacked slides faded in turn
  {
    name: 'stacked-fade-edit-slide2', head: '<style>.st{position:relative;height:40px}.st>p{position:absolute;inset:0;margin:0;opacity:0;transition:opacity .4s}.st>p.on{opacity:1}</style>',
    html: '<div class="st"><p class="on">Best bread in town</p><p>Lovely staff</p><p>Great coffee</p></div><script>(()=>{const s=[...document.querySelectorAll(".st>p")];let i=0;setInterval(()=>{s[i].classList.remove("on");i=(i+1)%s.length;s[i].classList.add("on")},2000)})()</script>',
    edit: setRe(/^Lovely staff$/, () => 'L'),
  },
  {
    name: 'rotating-words-inline', head: '<style>.rot{display:inline-grid}.rot>span{grid-area:1/1;opacity:0;transition:opacity .3s}.rot>span.on{opacity:1}</style>',
    html: '<h1>We bake <span class="rot"><span class="on">bread</span><span>cakes</span><span>pies</span></span> daily</h1><script>(()=>{const s=[...document.querySelectorAll(".rot>span")];let i=0;setInterval(()=>{s[i].classList.remove("on");i=(i+1)%s.length;s[i].classList.add("on")},1500)})()</script>',
    edit: setRe(/We bake/, (l) => l.replace('daily', 'every day')),
  },
  // RTL
  { name: 'rtl-number-edit', dir: ' dir="rtl" lang="ar"', html: '<p>افتتح المخبز عام ١٩٩٨ في عمان</p>', edit: setRe(/افتتح/, (l) => l.replace('١٩٩٨', '٢٠٠١')) },
  { name: 'rtl-latin-brand-glue', dir: ' dir="rtl" lang="ar"', html: '<p>قهوة Blue Bottle الآن</p>', edit: setRe(/قهوة/, (l) => l.replace('Bottle', 'Bottle!')) },
  { name: 'rtl-typed-space-between-runs', dir: ' dir="rtl" lang="ar"', html: '<p>خبزBread طازج</p>', edit: setRe(/خبز/, (l) => l.replace('خبزBread', 'خبز Bread')) },
  { name: 'rtl-glue-runs-remove-space', dir: ' dir="rtl" lang="ar"', html: '<p>خبز Bread طازج</p>', edit: setRe(/خبز/, (l) => l.replace('خبز Bread', 'خبزBread')) },
  { name: 'rtl-flex-row-typed-space', dir: ' dir="rtl" lang="ar"', html: '<p style="display:flex"><span>السعر</span><b>$20</b></p>', edit: setRe(/السعر/, () => 'السعر الجديد ') },
  { name: 'rtl-inline-margin-glue', dir: ' dir="rtl" lang="ar"', html: '<p>مرحبا<span style="margin-right:1em">بكم</span> هنا</p>', edit: setRe(/مرحبا/, (l) => l.replace('هنا', 'اليوم')) },
  { name: 'rtl-inline-margin-typed', dir: ' dir="rtl" lang="ar"', html: '<p><font>مرحبا</font><span style="margin-right:1em">بكم</span></p>', edit: setRe(/مرحبا/, () => 'أهلا') },
  { name: 'rtl-bdi-phone', dir: ' dir="rtl" lang="ar"', html: '<p>اتصل بنا <bdi>+962 6 500 0000</bdi> اليوم</p>', edit: setRe(/اتصل/, (l) => l.replace('اليوم', 'الآن!')) },
  { name: 'he-in-ltr-flex', html: '<p style="display:flex"><span>Order</span><b>שלום</b></p>', edit: setRe(/^Order$/, () => 'Order now ') },
  { name: 'ltr-in-rtl-flex-typed', dir: ' dir="rtl" lang="he"', html: '<p style="display:flex"><span>Cold brew</span><b>₪18</b></p>', edit: setRe(/Cold brew/, () => 'Cold brew large ') },
  { name: 'rtl-paren-number', dir: ' dir="rtl" lang="ar"', html: '<p>خبز ٩ (قريبا) طازج.</p>', edit: setRe(/خبز/, (l) => l.replace('طازج.', 'طازج جدا.')) },
  // glued punctuation into a word's slot
  { name: 'punct-into-hidden-overflow-slot', html: '<p><span style="display:inline-block;max-width:4.1em;overflow:hidden;white-space:nowrap;vertical-align:bottom">Pastry</span> shop</p>', edit: setRe(/Pastry/, (l) => l.replace('shop', 'shop!')) },
  { name: 'punct-start-into-word-slot', html: '<p style="display:flex;gap:6px"><b>Fresh</b> <span>bread</span></p>', edit: setRe(/^Fresh bread$/, () => '(Fresh bread') },
  { name: 'punct-end-flex-price', html: '<p style="display:flex;justify-content:space-between;width:300px"><span>Cacio e pepe</span><span>£13</span></p>', edit: setRe(/Cacio/, (l) => `${l}!`) },
  { name: 'punct-end-sup', html: '<p>Price<sup>*</sup> today</p>', edit: setRe(/Price/, (l) => `${l}!`) },
  // a kept break and a repeated word
  { name: 'preline-repeat', html: '<p style="white-space:pre-line">open\nopen Sign today</p>', edit: setRe(/open/, () => 'today! open Sign today') },
  { name: 'preline-glue-two', html: '<p style="white-space:pre-line">$29\nFrom\nCall late</p>', edit: setRe(/\$29/, () => '$29From Call late') },
];
