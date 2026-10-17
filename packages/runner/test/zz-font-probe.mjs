// Bring-up only (D4): which font Chromium uses for a vertical Japanese flex row, and how each candidate lays it out.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
for (const family of ['', 'WenQuanYi Zen Hei', 'IPAGothic', 'IPAPGothic', 'Noto Sans CJK JP', 'Noto Serif CJK JP', 'Yu Gothic', 'MS Gothic', 'Yu Mincho', 'MS Mincho']) {
  const style = family ? `font-family:'${family}';` : '';
  await page.setContent(`<!doctype html><html><head><title>T</title></head><body><div lang="ja" style="${style}writing-mode:vertical-rl;height:300px;display:flex"><span>営業時間</span><b>七時から</b></div></body></html>`);
  const rects = await page.evaluate(() => [...document.querySelectorAll('span,b')].map((e) => { const r = e.getBoundingClientRect(); return `${e.tagName} y=${Math.round(r.y)} h=${Math.round(r.height)} w=${Math.round(r.width)}`; }));
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'span' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  console.log(`${family || '(page default)'}: ${rects.join('; ')}; span drawn with ${fonts.map((f) => `${f.familyName} (${f.postScriptName}, ${f.glyphCount})`).join(', ')}`);
}
await browser.close();
