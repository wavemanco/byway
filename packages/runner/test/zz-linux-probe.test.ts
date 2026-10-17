/** Bring-up only (D4): what Chromium reads of one vertical Japanese page on this computer. Removed before merge. */
import { afterAll, it } from 'vitest';
import { playwrightPages } from '../src/pages.ts';
import { benchRun, putWork, voiceBench, VoiceQuestion } from './helpers/voice-activity.ts';

const chromium = playwrightPages();
afterAll(() => chromium.close(), 60_000);

it('probe: the vertical Japanese page', async () => {
  const b = await voiceBench([], { pages: chromium });
  try {
    const page = (body: string) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>\n`;
    const html = page('<div lang="ja" style="writing-mode:vertical-rl;height:300px;display:flex"><span>営業時間</span><b>七時から</b></div><div lang="ja" style="writing-mode:vertical-rl;height:300px"><p>毎朝五時に焼きたてのパンをお届けします。</p></div>');
    const none = async () => undefined;
    console.log('PROBE shownText', JSON.stringify((await chromium.shownText(html, none)).text));
    const q = await VoiceQuestion.open(b, await benchRun(b, 'web-page'), await putWork(b, 'web-page', html));
    console.log('PROBE offered', JSON.stringify(q.offered));
    console.log('PROBE prompt', JSON.stringify(q.prompt));
    const { chromium: pw } = await import('playwright');
    const browser = await pw.launch({ headless: true });
    const p = await browser.newPage();
    await p.setContent(html);
    console.log('PROBE fonts', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('span,b,p')].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { tag: e.tagName, text: e.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), font: cs.fontFamily, size: cs.fontSize }; }))));
    await browser.close();
  } finally {
    await b.close();
  }
}, 120_000);
