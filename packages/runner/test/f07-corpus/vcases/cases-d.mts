// Round-12 verifier, hand cases D: vertical and rotated text in more forms, a no-break space at a flex item's edge, and
// ordinary vertical Japanese (no typed spaces) for false refusals.
const set = (o: string[], i: number, t: string) => o.map((l, k) => (k === i ? t : l));
const setRe = (re: RegExp, f: (l: string) => string) => (o: string[]) => { const i = o.findIndex((l) => re.test(l)); return i < 0 ? undefined : set(o, i, f(o[i]!)); };
export const CASES = [
  { name: 'nbsp-flex-edge-taken-out', html: '<p style="display:flex"><b>Price:&nbsp;</b><font>$20</font></p>', edit: setRe(/Price/, () => 'Cost:') },
  { name: 'nbsp-flex-edge-kept', html: '<p style="display:flex"><b>Price:&nbsp;</b><font>$20</font></p>', edit: setRe(/Price/, (l) => l.replace('Price', 'Cost')) },
  { name: 'vlr-flex-typed', html: '<div style="writing-mode:vertical-lr;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', edit: setRe(/Fresh/, () => 'Fresh [bread] daily') },
  { name: 'sideways-flex-typed', html: '<div style="writing-mode:sideways-rl;display:flex;height:400px"><span>Fresh</span><a href="/b">bread</a></div>', edit: setRe(/Fresh/, () => 'Fresh [bread] daily') },
  { name: 'upright-chips-typed', html: '<div style="writing-mode:vertical-rl;text-orientation:upright;height:400px">Tags <span style="display:inline-block">NEW</span><span style="display:inline-block">HOT</span></div>', edit: setRe(/Tags/, () => 'Tags NEW HOT') },
  { name: 'rot90-buttons-typed', html: '<div style="position:absolute;left:40px;top:120px;transform:rotate(90deg);transform-origin:left top;white-space:nowrap">Follow <button type="button">us</button></div><p style="margin-left:80px">Body</p>', edit: setRe(/Follow/, () => 'Follow us now') },
  { name: 'rot90-flex-link-typed-before', html: '<div style="position:absolute;left:40px;top:120px;transform:rotate(90deg);transform-origin:left top;display:flex">Find<a href="/m">menu</a></div><p style="margin-left:80px">Body</p>', edit: setRe(/Find/, () => 'Find our [menu]') },
  { name: 'rot180-flex', html: '<div style="transform:rotate(180deg);display:flex;width:300px"><span>Upside</span><b>down</b></div>', edit: setRe(/Upside/, (l) => l) },
  { name: 'rot-15-flex-typed', html: '<div style="transform:rotate(-15deg);display:flex;width:400px;margin:60px"><span>Already have an account?</span><a href="/l">Sign in</a></div>', edit: setRe(/account/, (l) => `${l} today`) },
  { name: 'rot-45-flex-typed', html: '<div style="transform:rotate(-45deg);display:flex;width:400px;margin:120px"><span>Already registered?</span><a href="/l">Sign in</a></div>', edit: setRe(/registered/, (l) => `${l} today`) },
  // ordinary vertical Japanese: edits with no typed spaces should be stored
  { name: 'ja-vertical-edit', head: '<meta charset="utf-8">', html: '<div lang="ja" style="writing-mode:vertical-rl;height:300px"><h2>朝のパン屋</h2><p>毎朝五時に焼きたてのパンをお届けします。</p><p><a href="/menu">メニューを見る</a></p></div>', edit: setRe(/毎朝/, () => '毎朝六時に焼きたてのパンをお届けします。') },
  { name: 'ja-vertical-flex-edit', head: '<meta charset="utf-8">', html: '<div lang="ja" style="writing-mode:vertical-rl;height:300px;display:flex"><span>営業時間</span><b>七時から</b></div>', edit: setRe(/営業時間/, (l) => l.replace('七時から', '八時から')) },
];
