/**
 * D2 probe (read-only against the repo): what changes on this Windows host when the renderer's Chromium runs inside its
 * OS sandbox. Compares main's stated launch (chromiumLaunchOptions(), sandbox off) with the same options plus
 * chromiumSandbox: true. Measures: launch time, the effective command line (CDP), every Chromium process's --no-sandbox
 * flag and Windows integrity level, renders and the visitor read (scripts on, PNG and JPEG decoded through the artifact
 * route) compared byte for byte, and what byway says today if the sandbox could not start (simulated with echo.exe).
 * Run from the worktree: pnpm exec tsx <this file>. Writes probe-results.json next to itself.
 */
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WT = 'C:/Users/arvik/code/byway/.claude/worktrees/wf_6371d503-2fc-3';
const PS = path.join(HERE, 'integrity.ps1');
const ECHO = 'C:/Program Files/Git/usr/bin/echo.exe';

const pages = await import(pathToFileURL(`${WT}/packages/runner/src/pages.ts`).href);
const { chromiumLaunchOptions, playwrightPages, launchFailure, RENDERER_OS_SANDBOX } = pages;
const req = createRequire(`${WT}/packages/runner/package.json`);
const { chromium } = req('playwright');

const off = chromiumLaunchOptions();
const on = { ...off, chromiumSandbox: true };
const results: Record<string, unknown> = {
  node: process.version,
  platform: process.platform,
  playwright: req('playwright/package.json').version,
  chromiumExecutable: chromium.executablePath(),
  RENDERER_OS_SANDBOX,
  mainOptions: { headless: off.headless, chromiumSandbox: off.chromiumSandbox, args: off.args, envNames: Object.keys(off.env).length },
};
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').slice(0, 16);

// 1. Launch plus close, warm, 5 times each.
async function launchClose(o: object): Promise<number> {
  const t = performance.now();
  const b = await chromium.launch(o);
  await b.close();
  return Math.round(performance.now() - t);
}
const timing: Record<string, number[]> = { off: [], on: [] };
await launchClose(off);
await launchClose(on);
for (let i = 0; i < 5; i++) {
  timing.off.push(await launchClose(off));
  timing.on.push(await launchClose(on));
}
results.launchPlusCloseMs = timing;

// 2. The effective command line, read through CDP (needs the test-only --enable-automation).
async function hasNoSandbox(o: { args?: string[] }): Promise<boolean> {
  const b = await chromium.launch({ ...o, args: [...(o.args ?? []), '--enable-automation'] });
  try {
    const s = await b.newBrowserCDPSession();
    const r = await s.send('Browser.getBrowserCommandLine');
    return (r.arguments as string[]).includes('--no-sandbox');
  } finally {
    await b.close();
  }
}
results.cdpNoSandbox = { off: await hasNoSandbox(off), on: await hasNoSandbox(on) };

// 3. Every Chromium process this Node process started, with a page running a script open.
async function processes(o: object) {
  const b = await chromium.launch(o);
  try {
    const ctx = await b.newContext();
    const p = await ctx.newPage();
    await p.setContent('<p>x</p><script>document.title = "SCRIPT_RAN"</script>');
    const title = await p.title();
    let procs: unknown;
    try {
      const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS, '-ParentPid', String(process.pid)], { encoding: 'utf8', timeout: 60_000 });
      procs = JSON.parse(out.trim() || '[]');
    } catch (e) {
      procs = `integrity check failed: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`;
    }
    return { title, procs };
  } finally {
    await b.close();
  }
}
results.processes = { off: await processes(off), on: await processes(on) };

// 4. Renders and the visitor read, compared byte for byte. Images are made first, then decoded through the artifact route.
const maker = await chromium.launch(off);
const mp = await (await maker.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await mp.setContent('<body style="margin:0;height:360px;background:linear-gradient(135deg,#e63946,#457b9d 50%,#f1fa8c)"><h1 style="font:bold 48px sans-serif;color:#fff;padding:40px">Reference</h1></body>');
const png = new Uint8Array(await mp.screenshot({ type: 'png' }));
const jpg = new Uint8Array(await mp.screenshot({ type: 'jpeg', quality: 80 }));
await maker.close();
const resolve = async (id: string) => (id === 'img-png' ? { body: png, contentType: 'image/png' } : id === 'img-jpg' ? { body: jpg, contentType: 'image/jpeg' } : undefined);
const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>
<style>body{margin:0;font-family:Georgia,serif}main{padding:32px}.box{height:420px;background:linear-gradient(90deg,#c33,#33c)}img{display:block;max-width:100%}
.reveal{opacity:0;transition:opacity .4s}.reveal.on{opacity:1}</style></head>
<body><main><h1 id="h">Static heading</h1><p>Plain text before the images.</p>
<img src="/api/artifacts/img-png" alt="png"><img src="/api/artifacts/img-jpg" alt="jpg">
<canvas id="c" width="800" height="300"></canvas><div class="box"></div><p class="reveal" id="r">Text a script reveals.</p></main>
<script>document.title='SCRIPT_RAN';document.getElementById('h').textContent='Heading written by a script';
const c=document.getElementById('c').getContext('2d');for(let i=0;i<60;i++){c.fillStyle='hsl('+(i*7)+',70%,50%)';c.fillRect((i*13)%780,(i*37)%270,30,30);}
document.body.style.minHeight='5200px';setTimeout(()=>document.getElementById('r').classList.add('on'),300);</script></body></html>`;

async function drawAndRead(o: object) {
  const r = playwrightPages({ launch: () => chromium.launch(o) });
  try {
    const t0 = performance.now();
    const shots = await r.render(HTML, resolve, ['desktop', 'mobile', 'fold']);
    const renderMs = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const shown = await r.shownText(HTML, resolve);
    const readMs = Math.round(performance.now() - t1);
    return { tiles: shots.map((s: { surface: string; tiles: Uint8Array[] }) => `${s.surface}:${s.tiles.map(sha).join(',')}`), shown: JSON.stringify(shown), title: shown.title, renderMs, readMs };
  } finally {
    await r.close();
  }
}
const offA = await drawAndRead(off);
const offB = await drawAndRead(off);
const onA = await drawAndRead(on);
results.render = {
  offTiles: offA.tiles,
  onTiles: onA.tiles,
  offDeterministic: JSON.stringify(offA.tiles) === JSON.stringify(offB.tiles),
  tilesIdenticalOffVsOn: JSON.stringify(offA.tiles) === JSON.stringify(onA.tiles),
  shownTextIdenticalOffVsOn: offA.shown === onA.shown,
  shownTextOffDeterministic: offA.shown === offB.shown,
  titles: { off: offA.title, on: onA.title },
  shownTextSample: JSON.parse(onA.shown).text.slice(0, 160),
  ms: { off: [offA.renderMs, offA.readMs, offB.renderMs, offB.readMs], on: [onA.renderMs, onA.readMs] },
};

// 5. A host whose sandbox cannot start, simulated: echo.exe stands in for Chromium and prints the marker Chromium
// prints there (Linux with user namespaces restricted; running as root), then exits. What would byway say today if only
// RENDERER_OS_SANDBOX were switched on (launchFailure is main's mapping)?
const markers: Record<string, string> = {
  userns: 'No usable sandbox! If this is a Debian system, please install the chromium-sandbox package to solve this problem.',
  root: 'Running as root without --no-sandbox is not supported. See https://crbug.com/638180.',
  unrelated: 'some other start-up failure',
};
const failures: Record<string, unknown> = {};
for (const [k, marker] of Object.entries(markers)) {
  try {
    const b = await chromium.launch({ ...on, executablePath: ECHO, args: [...(on.args ?? []), marker], timeout: 15_000 });
    await b.close();
    failures[k] = 'launched?!';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    failures[k] = { firstLine: msg.split(/\r?\n/)[0], mentionsSandboxingFailed: msg.includes('Chromium sandboxing failed!'), suggestsSandboxFalse: msg.includes("chromiumSandbox: false"), bywayWouldSay: launchFailure(e).message };
  }
}
results.simulatedSandboxFailure = failures;

writeFileSync(path.join(HERE, 'probe-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
