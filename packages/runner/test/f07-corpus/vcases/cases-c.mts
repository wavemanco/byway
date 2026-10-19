// Round-12 verifier, hand cases C: geometry the visitor read's row test assumes away (vertical and rotated text), and an
// animation whose first keyframe stands an item apart from its neighbour.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
const KF = `<style>
@keyframes nudgeL{0%{transform:translateX(-14px)}8%,100%{transform:none}}
.nl2{display:inline-block;margin-left:24px;animation:nudgeL 3s infinite}
@keyframes peek{0%{transform:translateY(-120%)}10%,100%{transform:none}}
.peek{display:inline-block;animation:peek 4s infinite}
</style>`;
export const CASES = [
  { name: 'nudge2-link-typed-after', head: KF, html: '<p style="display:flex">Already have an account?<a class="nl2" href="/l">Sign in</a></p>', edit: setRe(/Sign in/, (l) => `${l} today`) },
  { name: 'peek-badge-typed-before', head: KF, html: '<h2 style="display:flex"><span>Pricing</span><b class="peek">New</b></h2>', edit: setRe(/^Pricing/, (l) => l.replace('Pricing', 'Pricing plans ')) },
  // vertical writing mode: a flex row of items set top to bottom
  { name: 'vertical-flex-typed-after', html: '<div style="writing-mode:vertical-rl;display:flex;height:400px">Already registered?<a href="/l">Sign in</a></div>', edit: setRe(/Sign in/, (l) => `${l} today`) },
  { name: 'vertical-chips-typed', html: '<p style="writing-mode:vertical-rl;height:300px">Tags: <span style="display:inline-block">New</span><span style="display:inline-block">tech</span></p>', edit: setRe(/Tags/, () => 'Tags: New tech') },
  // a side label rotated a quarter turn (Tailwind -rotate-90), its words flex items
  { name: 'rotated-flex-typed', html: '<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top;display:flex"><span>Scroll</span><a href="/more">down</a></div><p style="margin-left:80px">Body</p>', edit: setRe(/Scroll/, () => 'Scroll [down] now') },
  { name: 'rotated-flex-typed-mid', html: '<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top;display:flex"><span>Scroll</span><b>down</b></div><p style="margin-left:80px">Body</p>', edit: setRe(/^Scroll$/, () => 'Scroll on ') },
  { name: 'rotated-plain-glue', html: '<div style="position:absolute;left:0;top:200px;transform:rotate(-90deg);transform-origin:left top">Scroll down</div><p style="margin-left:80px">Body</p>', edit: setRe(/Scroll/, () => 'Scrolldown') },
];
