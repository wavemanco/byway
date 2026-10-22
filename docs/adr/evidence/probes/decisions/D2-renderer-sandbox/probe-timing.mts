/**
 * D2 probe: render and visitor-read times with the OS sandbox off (main) and on, warm, 5 each, alternating, plus
 * whether every tile and every read is identical across the two. Writes probe-timing-results.json.
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WT = 'C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-3';
const { chromiumLaunchOptions, playwrightPages } = await import(pathToFileURL(`${WT}/packages/runner/src/pages.ts`).href);
const { chromium } = createRequire(`${WT}/packages/runner/package.json`)('playwright');
const off = chromiumLaunchOptions();
const on = { ...off, chromiumSandbox: true };
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);
const none = async () => undefined;
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>
<style>body{margin:0;font-family:Georgia,serif}section{min-height:700px;padding:40px}.reveal{opacity:0;transition:opacity .4s}.reveal.on{opacity:1}</style></head><body>
${Array.from({ length: 8 }, (_, i) => `<section><h2>Section ${i + 1}</h2><p class="reveal">Paragraph ${i + 1} that a script reveals as the visitor scrolls.</p></section>`).join('')}
<script>const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('on')}));document.querySelectorAll('.reveal').forEach(el=>io.observe(el));</script></body></html>`;

const r = { off: playwrightPages({ launch: () => chromium.launch(off) }), on: playwrightPages({ launch: () => chromium.launch(on) }) };
const ms: Record<string, { render: number[]; read: number[] }> = { off: { render: [], read: [] }, on: { render: [], read: [] } };
const seen: Record<string, Set<string>> = { tiles: new Set(), reads: new Set() };
try {
  for (const k of ['off', 'on'] as const) {
    await r[k].render(HTML, none, ['desktop']);
    await r[k].shownText(HTML, none);
  }
  for (let i = 0; i < 5; i++) {
    for (const k of (i % 2 ? ['on', 'off'] : ['off', 'on']) as ('off' | 'on')[]) {
      let t = performance.now();
      const shots = await r[k].render(HTML, none, ['desktop', 'mobile', 'fold']);
      ms[k].render.push(Math.round(performance.now() - t));
      seen.tiles.add(JSON.stringify(shots.map((s: { tiles: Uint8Array[] }) => s.tiles.map(sha))));
      t = performance.now();
      const read = await r[k].shownText(HTML, none);
      ms[k].read.push(Math.round(performance.now() - t));
      seen.reads.add(JSON.stringify(read));
    }
  }
} finally {
  await r.off.close();
  await r.on.close();
}
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = { ms, medians: { off: { render: median(ms.off.render), read: median(ms.off.read) }, on: { render: median(ms.on.render), read: median(ms.on.read) } }, distinctTileSets: seen.tiles.size, distinctReads: seen.reads.size };
writeFileSync(path.join(HERE, 'probe-timing-results.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
